import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { accountsRouter } from "./routes/accounts.js";
import { postsRouter } from "./routes/posts.js";
import { cronRouter } from "./routes/cron.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/accounts", accountsRouter);
app.use("/posts", postsRouter);
app.use("/cron", cronRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

export default app;
