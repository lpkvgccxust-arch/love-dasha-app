import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type EventBody = {
  event?: string;
  payload?: Record<string, unknown>;
  initData?: string;
};

const ALLOWED_EVENTS = new Set(["app_opened", "game_opened", "game_finished"]);
const MAX_AGE_SECONDS = 60 * 60 * 24;

function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!receivedHash || !authDate || age < 0 || age > MAX_AGE_SECONDS) return null;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const received = Buffer.from(receivedHash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");
  if (received.length !== calculated.length || !timingSafeEqual(received, calculated)) return null;

  const userValue = params.get("user");
  if (!userValue) return null;
  try {
    return JSON.parse(userValue) as { id: number; first_name?: string; username?: string };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  const botToken = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!botToken || !ownerId) return res.status(503).json({ ok: false, error: "tracking_not_configured" });

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ ok: false, error: "invalid_event" });
  const eventBody = body as EventBody;
  if (typeof eventBody.initData !== "string" || eventBody.initData.length === 0 || eventBody.initData.length > 8192 || typeof eventBody.event !== "string" || !ALLOWED_EVENTS.has(eventBody.event)) return res.status(400).json({ ok: false, error: "invalid_event" });
  if (eventBody.payload !== undefined && (!eventBody.payload || typeof eventBody.payload !== "object" || Array.isArray(eventBody.payload))) return res.status(400).json({ ok: false, error: "invalid_payload" });
  const user = verifyTelegramInitData(eventBody.initData, botToken);
  if (!user) return res.status(401).json({ ok: false, error: "invalid_telegram_data" });

  const payload = eventBody.payload ?? {};
  const details = Object.entries(payload)
    .filter(([key, value]) => key.length <= 40 && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`)
    .join("\n");
  const name = user.username ? `@${user.username}` : user.first_name ?? `ID ${user.id}`;
  const labels: Record<string, string> = {
    app_opened: "открыла приложение",
    game_opened: "зашла в игру",
    game_finished: "завершила игру",
  };
  const text = `✨ Dasha Love Bot\nИгрок: ${name}\n${labels[eventBody.event] ?? eventBody.event}${details ? `\n${details}` : ""}`;

  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ownerId, text }),
  });
  if (!telegramResponse.ok) return res.status(502).json({ ok: false, error: "telegram_request_failed" });
  return res.status(200).json({ ok: true });
}
