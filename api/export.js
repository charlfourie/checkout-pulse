// GET /api/export?range=... — admin CSV download of raw responses (local Cape Town time).
import { getSql, ensureSchema, isAdmin, noDb, windowFor, TZ } from "../lib/db.js";

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  const sql = getSql();
  if (!sql) return noDb(res);
  await ensureSchema(sql);

  const w = windowFor(req.query);
  const local = `(created_at AT TIME ZONE '${TZ}')::date`;
  let clause = "TRUE", params = [];
  if (w.custom) { clause = `${local} BETWEEN $1::date AND $2::date`; params = [w.from, w.toExclusive]; }
  else if (!w.all) { clause = `${local} > (now() AT TIME ZONE '${TZ}')::date - $1::int`; params = [w.days]; }

  const rows = await sql.query(
    `SELECT to_char(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS local_time,
            to_char(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day,
            extract(hour FROM created_at AT TIME ZONE '${TZ}')::int AS hour,
            trim(to_char(created_at AT TIME ZONE '${TZ}', 'Dy')) AS weekday,
            score, scale, label, pct AS score_0_100, device
     FROM responses WHERE ${clause} ORDER BY created_at`, params);

  const esc = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ["local_time", "day", "hour", "weekday", "score", "scale", "label", "score_0_100", "device"];
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="checkout-feedback-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.status(200).send(csv);
}
