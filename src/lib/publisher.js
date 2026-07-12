import { prisma } from "./prisma.js";
import { decryptToken } from "./crypto.js";
import { getAdapter } from "../adapters/index.js";

/**
 * Publish a single PostTarget. Safe to call more than once for the same
 * target — if it already succeeded, this is a no-op.
 */
export async function publishTarget(targetId) {
  const target = await prisma.postTarget.findUniqueOrThrow({
    where: { id: targetId },
    include: { post: true, account: true },
  });

  if (target.status === "SUCCESS") {
    return { skipped: true, reason: "already succeeded" };
  }

  // Mark QUEUED first so a second cron tick (if the previous run is still
  // mid-flight) skips this target instead of publishing it twice.
  await prisma.postTarget.updateMany({
    where: { id: targetId, status: { in: ["PENDING", "FAILED"] } },
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
        data: { targetId, success: true, responseData: result.raw ?? {} },
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
    return { success: false, error: String(err.message ?? err) };
  }
}

/**
 * Find every target whose post is due (scheduledFor <= now) and hasn't
 * succeeded yet, then publish them one at a time. Called by the /cron
 * endpoint, which an external scheduler (cron-job.org) hits every few
 * minutes — this is the free-tier substitute for a BullMQ worker process.
 */
export async function publishDueTargets() {
  const due = await prisma.postTarget.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      post: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    },
    select: { id: true },
  });

  const results = [];
  for (const { id } of due) {
    results.push({ targetId: id, ...(await publishTarget(id)) });
  }

  // Mark posts DONE once every target has resolved (success or failure —
  // failures stay visible in the dashboard via PostTarget.status).
  const postIds = [
    ...new Set(
      (
        await prisma.postTarget.findMany({ where: { id: { in: due.map((d) => d.id) } }, select: { postId: true } })
      ).map((t) => t.postId)
    ),
  ];
  for (const postId of postIds) {
    const remaining = await prisma.postTarget.count({
      where: { postId, status: { in: ["PENDING", "QUEUED"] } },
    });
    if (remaining === 0) {
      await prisma.post.update({ where: { id: postId }, data: { status: "DONE" } });
    }
  }

  return results;
}
