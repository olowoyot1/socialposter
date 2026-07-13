import "dotenv/config";
import { app } from "../src/app.js";

// Vercel's Node runtime accepts a plain (req, res) => {} handler, which an
// Express app already is — no adapter library needed. vercel.json rewrites
// every request to this one function.
export default app;
