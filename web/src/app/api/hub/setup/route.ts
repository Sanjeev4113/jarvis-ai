import { randomInt } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { ollamaUp, providers } from "@/lib/llm/free";

/**
 * Owner-only "Connections": shows which free layers are live and lets Sanjeev paste a key once.
 * Every key is tested against the real service before it's saved to .env.local (chmod 600, gitignored) and
 * applied to the running server at once. Values are never sent back to the browser.
 */

const ENV = path.join(process.cwd(), ".env.local");
const ME = path.join(process.cwd(), ".data", "jarvis.json");
const canWrite = () => !process.env.VERCEL;

async function setEnv(pairs: Record<string, string>) {
  let text = existsSync(ENV) ? await readFile(ENV, "utf8") : "";
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
    process.env[k] = v;
  }
  await writeFile(ENV, text, { mode: 0o600 });
}

type Me = { chatId?: number; pairCode?: string; offset?: number; heartbeat?: number };
function readMe(): Me {
  try {
    return JSON.parse(readFileSync(ME, "utf8")) as Me;
  } catch {
    return {};
  }
}
async function writeMe(patch: Partial<Me>) {
  const me = { ...readMe(), ...patch };
  await mkdir(path.dirname(ME), { recursive: true });
  await writeFile(ME, JSON.stringify(me), { mode: 0o600 });
  return me;
}

let botName: { token: string; name: string } | null = null;
async function telegramBot(token: string) {
  if (botName?.token === token) return botName.name;
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; result?: { username: string } } | null;
  if (!j?.ok || !j.result) return null;
  botName = { token, name: j.result.username };
  return j.result.username;
}

export async function GET() {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const up = await ollamaUp();
  const me = readMe();
  // the pairing code lives next to the daemon on the Mac; read-only hosting (Vercel) just skips it
  if (!me.pairCode && canWrite()) Object.assign(me, await writeMe({ pairCode: String(randomInt(100000, 999999)) }).catch(() => ({})));
  const tg = process.env.TELEGRAM_BOT_TOKEN ? await telegramBot(process.env.TELEGRAM_BOT_TOKEN) : null;
  let heartbeat = 0;
  try {
    heartbeat = statSync(ME).mtimeMs;
  } catch {}
  return Response.json({
    canWrite: canWrite(),
    brains: providers("chat", true).map((p) => p.label),
    ollama: { up, model: process.env.OLLAMA_MODEL ?? "jarvis" },
    keys: {
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      gmail: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    },
    telegram: { bot: tg, linked: !!me.chatId, link: tg ? `https://t.me/${tg}?start=${me.pairCode}` : null },
    daemon: { lastSeen: me.heartbeat ?? heartbeat, running: Date.now() - (me.heartbeat ?? 0) < 120_000 },
  });
}

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gemini"), value: z.string().trim().min(20).max(200) }),
  z.object({ kind: z.literal("groq"), value: z.string().trim().min(20).max(200) }),
  z.object({ kind: z.literal("openrouter"), value: z.string().trim().min(20).max(200) }),
  z.object({ kind: z.literal("telegram"), value: z.string().trim().regex(/^\d{5,12}:[\w-]{30,60}$/, "That doesn't look like a BotFather token.") }),
  z.object({ kind: z.literal("gmail"), value: z.string().trim().min(16).max(40), user: z.email().optional() }),
  z.object({ kind: z.literal("telegram-link") }),
]);

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const b = parsed.data;
  const fail = (error: string) => Response.json({ ok: false, error }, { status: 400 });
  const save = async (pairs: Record<string, string>, detail: string) => {
    if (!canWrite()) return Response.json({ ok: true, saved: false, detail: `${detail} It works, but this server is read-only (Vercel): add it under Vercel → Settings → Environment Variables.` });
    await setEnv(pairs);
    return Response.json({ ok: true, saved: true, detail });
  };

  if (b.kind === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(b.value)}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r?.ok) return fail("Google rejected that key. Copy it again from aistudio.google.com/apikey.");
    return save({ GEMINI_API_KEY: b.value }, "Gemini connected (free tier).");
  }
  if (b.kind === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${b.value}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r?.ok) return fail("Groq rejected that key. Create one at console.groq.com/keys.");
    return save({ GROQ_API_KEY: b.value }, "Groq connected (free tier).");
  }
  if (b.kind === "openrouter") {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${b.value}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r?.ok) return fail("OpenRouter rejected that key.");
    return save({ OPENROUTER_API_KEY: b.value }, "OpenRouter connected (free models only).");
  }
  if (b.kind === "telegram") {
    const name = await telegramBot(b.value);
    if (!name) return fail("Telegram rejected that token. Copy the whole line BotFather sent (numbers:letters).");
    const res = await save({ TELEGRAM_BOT_TOKEN: b.value }, `Bot @${name} connected. Now tap “Link my Telegram”.`);
    return res;
  }

  if (b.kind === "gmail") {
    const user = b.user ?? process.env.GMAIL_USER ?? process.env.VAULT_OWNER_EMAIL ?? "sanjeevsudarsanam@gmail.com";
    const pass = b.value.replace(/\s+/g, "");
    if (!/^[a-z]{16}$/i.test(pass)) return fail("A Gmail app password is 16 letters (Google shows it as four groups of four).");
    try {
      await nodemailer.createTransport({ service: "gmail", auth: { user, pass } }).verify();
    } catch {
      return fail("Gmail refused it. Make sure 2-Step Verification is on and you copied the app password (not your normal password).");
    }
    return save({ GMAIL_USER: user, GMAIL_APP_PASSWORD: pass }, `Gmail connected as ${user}. JARVIS can now send approved mail and triage your inbox.`);
  }
  // telegram-link: find "/start <code>" sent to the bot and remember that chat as the only one allowed
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail("Connect the Telegram bot first.");
  const me = readMe();
  if (me.chatId) return Response.json({ ok: true, linked: true, detail: "Telegram is linked." });
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=0&allowed_updates=["message"]`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (r?.status === 409) return Response.json({ ok: true, linked: false, detail: "The JARVIS daemon is running and will finish linking by itself in a few seconds." });
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[] } | null;
  const hit = j?.result?.find((u) => u.message?.text?.trim() === `/start ${me.pairCode}`);
  if (!hit?.message) return Response.json({ ok: true, linked: false, detail: "Not yet: open the bot link, press Start, then tap “Link my Telegram” again." });
  if (!canWrite()) return Response.json({ ok: true, linked: false, detail: "Telegram linking happens on your Mac (the daemon runs there): open the hub locally, or just run npm run jarvis and send /start <code>." });
  await writeMe({ chatId: hit.message.chat.id, offset: hit.update_id + 1 });
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: hit.message.chat.id, text: "✅ Linked. I'm JARVIS. Morning brief at 8:00, nightly report at 21:30, alerts only when something needs you. Talk to me any time (run `npm run jarvis` on the Mac)." }),
  }).catch(() => null);
  return Response.json({ ok: true, linked: true, detail: "Telegram linked. JARVIS just said hello there." });
}
