import nodemailer from "nodemailer";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";

/**
 * Owner-only: send one email that Sanjeev reviewed and approved in the JARVIS approval card.
 * The model can only draft; this endpoint is called by his Send button, never by the model.
 * Gmail app password (GMAIL_USER / GMAIL_APP_PASSWORD). At most 30 mails a day; metadata is logged in .data/.
 */
const Body = z.object({
  to: z.array(z.email()).min(1).max(5),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  approved: z.literal(true),
});

let day = "";
let sent = 0;

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return Response.json({ error: "Mail isn't set up yet: add GMAIL_USER and GMAIL_APP_PASSWORD (a Gmail app password)." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the recipients, subject and message." }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  if (day !== today) [day, sent] = [today, 0];
  if (sent >= 30) return Response.json({ error: "Daily mail limit reached (30)." }, { status: 429 });
  const { to, subject, body } = parsed.data;
  try {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const info = await t.sendMail({ from: `Sanjeev Sudarsanam <${user}>`, to, subject, text: body });
    sent++;
    const log = path.join(process.cwd(), ".data", "jarvis-mail.log");
    await mkdir(path.dirname(log), { recursive: true }).catch(() => null);
    await appendFile(log, JSON.stringify({ at: new Date().toISOString(), to, subject, id: info.messageId }) + "\n", { mode: 0o600 }).catch(() => null);
    return Response.json({ ok: true, id: info.messageId });
  } catch (e) {
    return Response.json({ error: `Gmail refused the message: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
