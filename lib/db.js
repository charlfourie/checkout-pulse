import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";

export const TZ = "Africa/Johannesburg";
export const DEFAULT_SETTINGS = { question: "How was your experience today?", scale: 5 };

let sqlClient = null;
let schemaReady = false;

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}

export async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS responses (
    id          text PRIMARY KEY,
    created_at  timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    score       smallint NOT NULL,
    scale       smallint NOT NULL,
    label       text,
    pct         smallint NOT NULL,
    device      text
  )`;
  await sql`CREATE INDEX IF NOT EXISTS responses_created_at_idx ON responses (created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAdmin(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return safeEqual(token, process.env.ADMIN_PASSWORD || "");
}

export function isKiosk(req) {
  return safeEqual(req.headers["x-kiosk-key"] || "", process.env.KIOSK_KEY || "");
}

export function noDb(res) {
  return res.status(503).json({ error: "database_not_connected", message: "The database isn't connected yet. Add Neon to this project in Vercel, then redeploy." });
}

// Resolve a reporting window to [from, to) timestamps in local time.
export function windowFor(q) {
  const range = q.range || "7";
  if (range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) {
    return { from: q.from, toExclusive: q.to, custom: true };
  }
  if (range === "all") return { all: true };
  const days = range === "today" ? 1 : Math.min(Math.max(parseInt(range, 10) || 7, 1), 3650);
  return { days };
}
