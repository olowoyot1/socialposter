import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { encryptToken } from "../lib/crypto.js";
import { getAdapter, listPlatforms } from "../adapters/index.js";

export const accountsRouter = Router();

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
accountsRouter.get("/:platform/connect", async (req, res) => {
  const platform = req.params.platform.toUpperCase();
  const adapter = getAdapter(platform);
  const state = randomUUID();
  const { url, verifier } = adapter.getAuthUrl(state);

  // Stored in the DB, not memory — /connect and /callback can land on
  // different serverless function instances with no shared memory.
  await prisma.oAuthState.create({ data: { state, platform, codeVerifier: verifier ?? null } });

  res.redirect(url);
});

// Step 2: platform redirects back here with a code (+ state) to exchange.
accountsRouter.get("/:platform/callback", async (req, res) => {
  const platform = req.params.platform.toUpperCase();
  const state = req.query.state;

  const pending = await prisma.oAuthState.findUnique({ where: { state } });
  if (!pending || pending.platform !== platform) {
    return res.status(400).json({ error: "Invalid or expired OAuth state" });
  }
  await prisma.oAuthState.delete({ where: { state } });

  try {
    const adapter = getAdapter(platform);
    const result = await adapter.handleOAuthCallback(req.query, pending.codeVerifier);

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
