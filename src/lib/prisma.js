import { PrismaClient } from "@prisma/client";

// Single shared instance across the app (avoids exhausting DB connections
// with --watch reloads in dev).
export const prisma = globalThis.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;
