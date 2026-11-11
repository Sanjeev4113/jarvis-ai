import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import * as webpush from "web-push";
import { readState, writeState } from "./stateStore";

/**
 * JARVIS phone calls, free: a Web Push "call" rings every device where the hub is installed (phone too, even with the
 * app closed); answering opens a live voice conversation. Scheduled calls are fired by whoever is awake first:
 * the JARVIS daemon on the Mac, the open hub, or the daily cron on Vercel.
 * Subscriptions and the schedule live in the private Blob store (file fallback on the Mac).
 */

export type Topic = "updates" | "dsa" | "jobs" | "note";
export type ScheduledCall = { id: string; at: number; topic: Topic; note?: string; repeat?: "none" | "daily" | "weekdays"; firedAt?: number };
type Sub = webpush.PushSubscription & { added: number; device?: string };

const DATA = path.join(process.cwd(), ".data");
async function load<T>(key: string, fallback: T): Promise<T> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await get(key, { access: "private", useCache: false });
      if (r?.stream) return JSON.parse(await new Response(r.stream).text()) as T;
      if (r === null) return fallback;
    } catch {}
  }
  try {
    return JSON.parse(await readFile(path.join(DATA, key.replace("/", "-")), "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function save(key: string, v: unknown) {
  const body = JSON.stringify(v);
  if (process.env.BLOB_READ_WRITE_TOKEN) await put(key, body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 }).catch(() => null);
  if (!process.env.VERCEL) {
    await mkdir(DATA, { recursive: true }).catch(() => null);
    await writeFile(path.join(DATA, key.replace("/", "-")), body, { mode: 0o600 }).catch(() => null);
  }
}

export const listSubs = () => load<Sub[]>("hub/push.json", []);
export async function addSub(s: webpush.PushSubscription, device?: string) {
  const subs = (await listSubs()).filter((x) => x.endpoint !== s.endpoint);
  subs.push({ ...s, added: Date.now(), device });
  await save("hub/push.json", subs.slice(-10));
  return subs.length;
}
export async function removeSub(endpoint: string) {
  await save("hub/push.json", (await listSubs()).filter((x) => x.endpoint !== endpoint));
}

export const listCalls = () => load<ScheduledCall[]>("hub/calls.json", []);
export const saveCalls = (c: ScheduledCall[]) => save("hub/calls.json", c.slice(-50));

export const TOPIC_TEXT: Record<Topic, string> = {
  updates: "Your updates: today's plan, tasks, new job matches and important mail.",
  dsa: "Time for your DSA practice. Let's go over today's concept.",
  jobs: "Here are your newest job matches.",
  note: "A scheduled call from JARVIS.",
};

/** Ring every device now (push) and flag the call in the shared hub state (open hubs show the incoming-call screen). */
export async function callNow(text: string, topic: Topic = "note", id = `c${Date.now().toString(36)}`, flag = true) {
  const results = { pushed: 0, failed: 0, flagged: false };
  if (flag) try {
    const raw = await readState();
    const h = raw ? (JSON.parse(raw) as Record<string, unknown>) : { updatedAt: 0 };
    h.call = { id, at: Date.now(), text, topic };
    h.updatedAt = Date.now();
    results.flagged = await writeState(JSON.stringify(h));
  } catch {}
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return results;
  webpush.setVapidDetails(`mailto:${process.env.VAULT_OWNER_EMAIL ?? "jarvis@example.com"}`, pub, priv);
  const subs = await listSubs();
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify({ type: "call", id, text, topic }), { TTL: 600, urgency: "high" });
        results.pushed++;
      } catch (e) {
        results.failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await save("hub/push.json", subs.filter((s) => !dead.includes(s.endpoint)));
  return results;
}

/** Fire every scheduled call that is due (and roll repeating ones forward). Safe to call from several places. */
export async function fireDue(now = Date.now()) {
  const calls = await listCalls();
  let fired = 0;
  let changed = false;
  for (const c of calls) {
    if (c.at > now || (c.firedAt && c.firedAt >= c.at)) continue;
    if (now - c.at < 30 * 60_000) {
      await callNow(c.topic === "note" && c.note ? c.note : TOPIC_TEXT[c.topic], c.topic, c.id);
      fired++;
    }
    c.firedAt = now;
    changed = true;
    if (c.repeat && c.repeat !== "none") {
      let next = c.at + 86_400_000;
      while (next <= now) next += 86_400_000;
      if (c.repeat === "weekdays") while ([0, 6].includes(new Date(next).getDay())) next += 86_400_000;
      c.at = next;
      c.firedAt = undefined;
    }
  }
  if (changed) await saveCalls(calls.filter((c) => !(c.firedAt && (!c.repeat || c.repeat === "none") && now - c.at > 86_400_000)));
  return fired;
}
