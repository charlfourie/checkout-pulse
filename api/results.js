// GET /api/results?range=today|7|30|90|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD — admin dashboard data.
// DELETE /api/results with {"confirm":"DELETE", range...} — admin clears responses in a window (e.g. test taps).
import { getSql, ensureSchema, isAdmin, noDb, windowFor, TZ } from "../lib/db.js";

function whereFor(q) {
  const w = windowFor(q);
  const local = `(created_at AT TIME ZONE '${TZ}')::date`;
  const today = `(now() AT TIME ZONE '${TZ}')::date`;
  if (w.all) return { clause: "TRUE", params: [] };
  if (w.custom) return { clause: `${local} BETWEEN $1::date AND $2::date`, params: [w.from, w.toExclusive] };
  return { clause: `${local} > ${today} - $1::int`, params: [w.days] };
}

const HAPPY = "((scale = 3 AND score = 3) OR (scale = 5 AND score >= 4))";
const SAD = "((scale = 3 AND score = 1) OR (scale = 5 AND score <= 2))";
const BUCKET = "(CASE WHEN scale = 3 THEN (score - 1) * 2 + 1 ELSE score END)";

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  const sql = getSql();
  if (!sql) return noDb(res);
  await ensureSchema(sql);

  if (req.method === "DELETE") {
    if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: "confirm_required" });
    const { clause, params } = whereFor(req.body || {});
    const r = await sql.query(`WITH d AS (DELETE FROM responses WHERE ${clause} RETURNING 1) SELECT count(*)::int AS n FROM d`, params);
    return res.status(200).json({ deleted: r[0].n });
  }
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { clause, params } = whereFor(req.query);
  const loc = `created_at AT TIME ZONE '${TZ}'`;
  try {
    const [summary, dist, byDay, byHour, byWeekday, recent] = await Promise.all([
      sql.query(`SELECT count(*)::int AS n, round(avg(pct))::int AS score,
                   round(100.0 * count(*) FILTER (WHERE ${HAPPY}) / NULLIF(count(*), 0))::int AS happy,
                   round(100.0 * count(*) FILTER (WHERE ${SAD}) / NULLIF(count(*), 0))::int AS unhappy,
                   min(created_at) AS first_at, max(created_at) AS last_at
                 FROM responses WHERE ${clause}`, params),
      sql.query(`SELECT ${BUCKET} AS bucket, count(*)::int AS n FROM responses WHERE ${clause} GROUP BY 1`, params),
      sql.query(`SELECT to_char((${loc})::date, 'YYYY-MM-DD') AS day, count(*)::int AS n, round(avg(pct))::int AS score,
                   round(100.0 * count(*) FILTER (WHERE ${HAPPY}) / count(*))::int AS happy,
                   round(100.0 * count(*) FILTER (WHERE ${SAD}) / count(*))::int AS unhappy
                 FROM responses WHERE ${clause} GROUP BY 1 ORDER BY 1 DESC LIMIT 400`, params),
      sql.query(`SELECT extract(hour FROM ${loc})::int AS hour, count(*)::int AS n, round(avg(pct))::int AS score
                 FROM responses WHERE ${clause} GROUP BY 1 ORDER BY 1`, params),
      sql.query(`SELECT extract(isodow FROM ${loc})::int AS dow, count(*)::int AS n, round(avg(pct))::int AS score
                 FROM responses WHERE ${clause} GROUP BY 1 ORDER BY 1`, params),
      sql.query(`SELECT to_char(${loc}, 'YYYY-MM-DD HH24:MI') AS at, score, scale, label
                 FROM responses WHERE ${clause} ORDER BY created_at DESC LIMIT 25`, params),
    ]);
    return res.status(200).json({ summary: summary[0], dist, byDay, byHour, byWeekday, recent });
  } catch (e) {
    console.error("results failed", e);
    return res.status(500).json({ error: "query_failed" });
  }
}
