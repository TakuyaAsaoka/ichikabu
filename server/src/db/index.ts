import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL が設定されていない。.env.example を .env.local にコピーすること",
  );
}

export const db = drizzle(url, { schema });
