import { Router } from "express";
import { publishDueTargets } from "../lib/publisher.js";

export const cronRouter = Router();

// Protect this with a shared secret so randos on the internet can't trigger
// your publish pipeline. cron-job.org can send it as a header or query param.
function checkSecret(req, res, next) {
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: "CRON_SECRET is not configured on the server" });
  }
  if (provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Invalid or missing cron secret" });
  }
  next();
}

cronRouter.post("/publish-due", checkSecret, async (req, res) => {
  try {
    const results = await publishDueTargets();
    res.json({ processed: results.length, results });
  } catch (err) {
    console.error("publish-due failed:", err);
    res.status(500).json({ error: String(err.message ?? err) });
  }
});

// GET too, since some free cron pingers default to GET requests.
cronRouter.get("/publish-due", checkSecret, async (req, res) => {
  try {
    const results = await publishDueTargets();
    res.json({ processed: results.length, results });
  } catch (err) {
    console.error("publish-due failed:", err);
    res.status(500).json({ error: String(err.message ?? err) });
  }
});
