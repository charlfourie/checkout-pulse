// GET /api/config — public kiosk settings. POST — admin saves settings.
import { getSql, ensureSchema, isAdmin, DEFAULT_SETTINGS, noDb } from "../lib/db.js";

export default async function handler(req, res) {
  const sql = getSql();
  if (req.method === "GET") {
    if (!sql) return res.status(200).json({ ...DEFAULT_SETTINGS, db: false });
    try {
      await ensureSchema(sql);
      const rows = await sql`SELECT value FROM settings WHERE key = 'kiosk'`;
      return res.status(200).json({ ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}), db: true });
    } catch (e) {
      console.error(e);
      return res.status(200).json({ ...DEFAULT_SETTINGS, db: false });
    }
  }
  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
    if (!sql) return noDb(res);
    const scale = req.body?.scale === 3 ? 3 : 5;
    const question = String(req.body?.question || "").trim().slice(0, 80) || DEFAULT_SETTINGS.question;
    await ensureSchema(sql);
    await sql`INSERT INTO settings (key, value) VALUES ('kiosk', ${JSON.stringify({ scale, question })}::jsonb)
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    return res.status(200).json({ scale, question });
  }
  return res.status(405).json({ error: "method_not_allowed" });
}
