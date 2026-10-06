import 'server-only';
import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { fuzzfitDb?: PrismaClient };
export const db = globalDb.fuzzfitDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.fuzzfitDb = db;
