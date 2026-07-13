import express from "express";
import cors from "cors";
import { accountsRouter } from "./routes/accounts.js";
import { postsRouter } from "./routes/posts.js";
import { cronRouter } from "./routes/cron.js";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use("/accounts", accountsRouter);
app.use("/posts", postsRouter);
app.use("/cron", cronRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

export default app;
