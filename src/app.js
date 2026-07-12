import express from "express";
import cors from "cors";
import { accountsRouter } from "./routes/accounts.js";
import { postsRouter } from "./routes/posts.js";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use("/accounts", accountsRouter);
app.use("/posts", postsRouter);

app.get("/health", (req, res) => res.json({ ok: true }));
