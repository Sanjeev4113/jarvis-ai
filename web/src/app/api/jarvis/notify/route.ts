import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { channelsReady, loadConfig, notifyOwner, tick } from "@/lib/hub/notify";

export const maxDuration = 60;

/**
 * JARVIS email updates.
 *   GET  (owner)                       status
 *   GET  ?key=CRON_SECRET or Bearer    heartbeat for a free external pinger (e.g. cron-job.org every 5 minutes)
 *   POST (owner) {action:"tick"}       heartbeat from the open hub
 *   POST (owner) {action:"test"}       send a test email now
 */
function cronOk(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? new URL(req.url).searchParams.get("key") ?? "";
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (cronOk(req)) {
    const r = await tick();
    return Response.json({ ok: true, sent: r.sent.length });
  }
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json({ ...channelsReady(), lastSent: (await loadConfig()).lastSent ?? null });
}

const Body = z.object({ action: z.enum(["tick", "test"]) });

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "bad request" }, { status: 400 });
  if (p.data.action === "tick") {
    const r = await tick();
    return Response.json({ sent: r.sent, channel: r.channel });
  }
  const channel = await notifyOwner("Test update", "Email updates are working.\nYou'll get reminders when they fall due, important plan blocks as they start, your 8:00 morning brief, your 21:30 nightly report and new job openings (70%+ match).");
  return Response.json({ channel });
}
