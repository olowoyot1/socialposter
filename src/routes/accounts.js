import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { encryptToken } from "../lib/crypto.js";
import { getAdapter, listPlatforms } from "../adapters/index.js";

export const accountsRouter = Router();

const pendingStates = new Map(); // state -> platform, for the OAuth round trip

accountsRouter.get("/platforms", (req, res) => {
  res.json({ platforms: listPlatforms() });
});

accountsRouter.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    select: { id: true, platform: true, displayName: true, createdAt: true },
  });
  res.json({ accounts });
});

// Step 1: redirect the user to the platform's OAuth consent screen.
accountsRouter.get("/:platform/connect", (req, res) => {
  const platform = req.params.platform.toUpperCase();
  const adapter = getAdapter(platform);
  const state = randomUUID();
  pendingStates.set(state, platform);

  const url = adapter.getAuthUrl(state);
  res.redirect(url);
});

// Step 2: platform redirects back here with a code (+ state) to exchange.
accountsRouter.get("/:platform/callback", async (req, res) => {
  const platform = req.params.platform.toUpperCase();
  const state = req.query.state;

  if (pendingStates.get(state) !== platform) {
    return res.status(400).json({ error: "Invalid or expired OAuth state" });
  }
  pendingStates.delete(state);

  try {
    const adapter = getAdapter(platform);
    const result = await adapter.handleOAuthCallback(req.query);

    const account = await prisma.account.upsert({
      where: { platform_externalId: { platform, externalId: result.externalId } },
      update: {
        displayName: result.displayName,
        accessToken: encryptToken(result.accessToken),
        refreshToken: result.refreshToken ? encryptToken(result.refreshToken) : null,
        tokenExpires: result.tokenExpires,
        metadata: result.metadata ?? {},
      },
      create: {
        platform,
        externalId: result.externalId,
        displayName: result.displayName,
        accessToken: encryptToken(result.accessToken),
        refreshToken: result.refreshToken ? encryptToken(result.refreshToken) : null,
        tokenExpires: result.tokenExpires,
        metadata: result.metadata ?? {},
      },
    });

    res.redirect(`/?connected=${account.platform}`);
  } catch (err) {
    console.error(`OAuth callback failed for ${platform}:`, err);
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

accountsRouter.delete("/:id", async (req, res) => {
  await prisma.account.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
