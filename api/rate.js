// POST /api/rate — the kiosk sends one or more taps. Idempotent by id, so retries never double-count.
import { getSql, ensureSchema, isKiosk, noDb } from "../lib/db.js";

const ID_RE = /^[a-z0-9-]{6,40}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isKiosk(req)) return res.status(401).json({ error: "bad_kiosk_key", message: "This tablet isn't set up. Open the setup link once on the tablet." });
  const sql = getSql();
  if (!sql) return noDb(res);

  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
  const now = Date.now();
  const clean = [];
  for (const it of items) {
    const scale = it.scale === 3 ? 3 : it.scale === 5 ? 5 : null;
    const score = Number.isInteger(it.score) ? it.score : null;
    const ts = Date.parse(it.ts);
    if (!ID_RE.test(it.id || "") || !scale || !score || score < 1 || score > scale) continue;
    if (!Number.isFinite(ts) || ts > now + 5 * 60e3 || ts < now - 90 * 864e5) continue;
    clean.push({ id: it.id, ts: new Date(ts).toISOString(), score, scale,
      label: String(it.label || "").slice(0, 40), pct: Math.round((score - 1) / (scale - 1) * 100),
      device: String(it.device || "tablet").slice(0, 40) });
  }
  if (!clean.length) return res.status(200).json({ saved: 0, accepted: [] });

  try {
    await ensureSchema(sql);
    await sql.query(
      `INSERT INTO responses (id, created_at, score, scale, label, pct, device)
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(id text, ts timestamptz, score smallint, scale smallint, label text, pct smallint, device text)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(clean)]
    );
    // Report every submitted id as handled (including ones we dropped as invalid) so the kiosk clears them.
    return res.status(200).json({ saved: clean.length, accepted: items.map(i => i.id) });
  } catch (e) {
    console.error("rate insert failed", e);
    return res.status(500).json({ error: "save_failed" });
  }
}
