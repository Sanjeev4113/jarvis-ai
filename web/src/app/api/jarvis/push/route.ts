import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { addSub, removeSub } from "@/lib/hub/calls";

/** Owner-only: register this device (phone, laptop) to receive JARVIS calls as push notifications. */
const Sub = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }), device: z.string().max(80).optional() });

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  const n = await addSub({ endpoint: p.data.endpoint, keys: p.data.keys }, p.data.device);
  return Response.json({ ok: true, devices: n });
}
export async function DELETE(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const { endpoint } = ((await req.json().catch(() => ({}))) as { endpoint?: string }) ?? {};
  if (endpoint) await removeSub(endpoint);
  return Response.json({ ok: true });
}
