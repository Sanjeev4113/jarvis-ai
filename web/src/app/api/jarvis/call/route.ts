import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { TOPIC_TEXT, callNow, fireDue, listCalls, listSubs, saveCalls, type Topic } from "@/lib/hub/calls";

/**
 * Owner-only JARVIS calls: ring now, schedule, list, cancel, and fire due ones (the open hub calls this every minute).
 */
const Body = z.object({
  action: z.enum(["now", "schedule", "fire"]),
  topic: z.enum(["updates", "dsa", "jobs", "note"]).default("updates"),
  note: z.string().max(300).optional(),
  at: z.number().optional(),
  repeat: z.enum(["none", "daily", "weekdays"]).default("none"),
});

export async function GET() {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const [calls, subs] = await Promise.all([listCalls(), listSubs()]);
  return Response.json({ calls: calls.sort((a, b) => a.at - b.at), devices: subs.map((s) => ({ device: s.device ?? "device", added: s.added })), push: !!process.env.VAPID_PRIVATE_KEY });
}

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const b = p.data;
  if (b.action === "fire") return Response.json({ fired: await fireDue() });
  const text = b.topic === "note" && b.note ? b.note : TOPIC_TEXT[b.topic as Topic];
  if (b.action === "now") return Response.json({ ok: true, ...(await callNow(text, b.topic as Topic)) });
  if (!b.at || b.at < Date.now() - 60_000) return Response.json({ error: "Pick a time in the future." }, { status: 400 });
  const calls = await listCalls();
  const id = `s${Date.now().toString(36)}`;
  calls.push({ id, at: b.at, topic: b.topic as Topic, note: b.note, repeat: b.repeat });
  await saveCalls(calls);
  return Response.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const { id } = ((await req.json().catch(() => ({}))) as { id?: string }) ?? {};
  await saveCalls((await listCalls()).filter((c) => c.id !== id));
  return Response.json({ ok: true });
}
