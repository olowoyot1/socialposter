import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "./publishQueue.js";
import { prisma } from "../lib/prisma.js";
import { decryptToken } from "../lib/crypto.js";
import { getAdapter } from "../adapters/index.js";

async function processTarget(job) {
  const { targetId } = job.data;

  const target = await prisma.postTarget.findUniqueOrThrow({
    where: { id: targetId },
    include: { post: true, account: true },
  });

  // Idempotency guard: if a previous attempt already succeeded (e.g. the
  // worker crashed after publishing but before marking DONE), don't post twice.
  if (target.status === "SUCCESS") {
    return { skipped: true, reason: "already succeeded" };
  }

  await prisma.postTarget.update({
    where: { id: targetId },
    data: { status: "QUEUED" },
  });

  const adapter = getAdapter(target.account.platform);
  const account = { ...target.account, accessToken: decryptToken(target.account.accessToken) };
  const post = {
    body: target.overrideBody ?? target.post.body,
    mediaUrls: target.post.mediaUrls,
  };

  try {
    const validated = await adapter.validate(post);
    const result = await adapter.publish(account, validated);

    await prisma.$transaction([
      prisma.postTarget.update({
        where: { id: targetId },
        data: { status: "SUCCESS", externalPostId: result.externalPostId, lastError: null },
      }),
      prisma.publishAttempt.create({
        data: {
          targetId,
          success: true,
          responseData: result.raw ?? {},
        },
      }),
    ]);

    return { success: true, externalPostId: result.externalPostId };
  } catch (err) {
    await prisma.$transaction([
      prisma.postTarget.update({
        where: { id: targetId },
        data: { status: "FAILED", lastError: String(err.message ?? err) },
      }),
      prisma.publishAttempt.create({
        data: { targetId, success: false, errorMessage: String(err.message ?? err) },
      }),
    ]);
    throw err; // let BullMQ's retry/backoff handle it
  }
}

const worker = new Worker("publish", processTarget, {
  connection,
  concurrency: 3,
});

worker.on("completed", (job, result) => {
  console.log(`[worker] job ${job.id} done:`, result);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

console.log("Publish worker running...");
