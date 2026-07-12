import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getAdapter } from "../adapters/index.js";

export const postsRouter = Router();

// Create a draft or immediately-scheduled post, targeting one or more accounts.
// body: { body, mediaUrls, scheduledFor?, accountIds: [...], overrides?: {accountId: text} }
postsRouter.post("/", async (req, res) => {
  const { body, mediaUrls = [], scheduledFor, accountIds, overrides = {} } = req.body;

  if (!accountIds?.length) {
    return res.status(400).json({ error: "accountIds is required (at least one target)" });
  }

  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });

  // Validate against EVERY target platform before creating anything —
  // fail fast instead of half-scheduling a post.
  const validationErrors = [];
  for (const account of accounts) {
    const adapter = getAdapter(account.platform);
    const candidate = { body: overrides[account.id] ?? body, mediaUrls };
    try {
      await adapter.validate(candidate);
    } catch (err) {
      validationErrors.push({ accountId: account.id, platform: account.platform, error: err.message });
    }
  }
  if (validationErrors.length) {
    return res.status(422).json({ error: "Validation failed", details: validationErrors });
  }

  const status = scheduledFor ? "SCHEDULED" : "DRAFT";

  const post = await prisma.post.create({
    data: {
      body,
      mediaUrls,
      status,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      targets: {
        create: accounts.map((a) => ({
          accountId: a.id,
          overrideBody: overrides[a.id] ?? null,
        })),
      },
    },
    include: { targets: true },
  });

  // No queue to push to — the /cron/publish-due endpoint (hit periodically
  // by an external scheduler) picks up any SCHEDULED post whose time has
  // come. See README for the free cron-job.org setup.

  res.status(201).json({ post });
});

postsRouter.get("/", async (req, res) => {
  const posts = await prisma.post.findMany({
    include: { targets: { include: { account: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ posts });
});

postsRouter.get("/:id", async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: { targets: { include: { account: true, attempts: true } } },
  });
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json({ post });
});
