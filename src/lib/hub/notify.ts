import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";
import nodemailer from "nodemailer";
import { readState } from "./stateStore";
import { callNow, fireDue } from "./calls";
import { DSA, dayFor } from "../../content/dsa";

/**
 * JARVIS's notification engine, shared by the cloud heartbeat (Vercel cron / open hub / any free pinger) and the
 * daemon on the Mac. Emails Sanjeev reminders, important plan blocks, the morning brief, the nightly report and new
 * job openings (Gmail app password: free forever). Telegram is the fallback; reminders also ring his phone.
 * A shared "already sent" log means several schedulers never send the same thing twice.
 */

const TZ = "Asia/Kolkata";
const DATA = path.join(process.cwd(), ".data");

/* ---------------- shared "already sent" log ---------------- */
type Log = Record<string, number>;
async function loadLog(): Promise<Log> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await get("hub/notified.json", { access: "private", useCache: false });
      if (r?.stream) return JSON.parse(await new Response(r.stream).text()) as Log;
      if (r === null) return {};
    } catch {}
  }
  try {
    return JSON.parse(await readFile(path.join(DATA, "hub-notified.json"), "utf8")) as Log;
  } catch {
    return {};
  }
}
async function saveLog(l: Log) {
  const cutoff = Date.now() - 4 * 86_400_000;
  for (const [k, t] of Object.entries(l)) if (t < cutoff) delete l[k];
  const body = JSON.stringify(l);
  if (process.env.BLOB_READ_WRITE_TOKEN) await put("hub/notified.json", body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 }).catch(() => null);
  if (!process.env.VERCEL) {
    await mkdir(DATA, { recursive: true }).catch(() => null);
    await writeFile(path.join(DATA, "hub-notified.json"), body, { mode: 0o600 }).catch(() => null);
  }
}

/** Claim a one-time key in the shared log (true = you own it, send it; false = someone already sent it). */
export async function claim(key: string) {
  const log = await loadLog();
  if (log[key]) return false;
  log[key] = Date.now();
  await saveLog(log);
  return true;
}

/* ---------------- status (private Blob): when and how the last update went out ---------------- */
export type NotifyConfig = { lastSent?: { at: number; channel: Channel; title: string } };
export async function loadConfig(): Promise<NotifyConfig> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await get("hub/notify.json", { access: "private", useCache: false });
      if (r?.stream) return JSON.parse(await new Response(r.stream).text()) as NotifyConfig;
      if (r === null) return {};
    } catch {}
  }
  try {
    return JSON.parse(await readFile(path.join(DATA, "hub-notify.json"), "utf8")) as NotifyConfig;
  } catch {
    return {};
  }
}
async function saveConfig(c: NotifyConfig) {
  const body = JSON.stringify(c);
  if (process.env.BLOB_READ_WRITE_TOKEN) await put("hub/notify.json", body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 }).catch(() => null);
  if (!process.env.VERCEL) {
    await mkdir(DATA, { recursive: true }).catch(() => null);
    await writeFile(path.join(DATA, "hub-notify.json"), body, { mode: 0o600 }).catch(() => null);
  }
}

/* ---------------- delivery: email (Gmail, free), Telegram as the fallback ---------------- */
export const ownerEmail = () => process.env.VAULT_OWNER_EMAIL ?? process.env.GMAIL_USER ?? "sanjeevsudarsanam@gmail.com";
function telegramChat() {
  if (process.env.TELEGRAM_CHAT_ID) return Number(process.env.TELEGRAM_CHAT_ID);
  try {
    return (JSON.parse(readFileSync(path.join(DATA, "jarvis.json"), "utf8")) as { chatId?: number }).chatId;
  } catch {
    return undefined;
  }
}
async function telegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = telegramChat();
  if (!token || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  return !!r?.ok;
}
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain text → a clean HTML email: links clickable, line breaks kept, a link back to the hub. */
function emailHtml(title: string, body: string, urgent: boolean) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sanjeev-sudarsanam.vercel.app";
  const html = esc(body)
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#2563eb">${u.length > 70 ? u.slice(0, 67) + "…" : u}</a>`)
    .replace(/\n/g, "<br>");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:auto;padding:20px;color:#111;line-height:1.6">
<div style="font-size:12px;letter-spacing:.2em;color:#0ea5e9;font-weight:700">JARVIS</div>
<h2 style="margin:6px 0 14px;font-size:20px;${urgent ? "color:#dc2626" : ""}">${esc(title)}</h2>
<div style="font-size:15px">${html}</div>
<p style="margin-top:22px;font-size:13px"><a href="${site}/jobai#planner" style="color:#2563eb">Open your hub</a> · <span style="color:#666">sent by JARVIS from your portfolio</span></p></div>`;
}
async function email(title: string, body: string, urgent: boolean) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return false;
  try {
    await nodemailer
      .createTransport({ service: "gmail", auth: { user, pass } })
      .sendMail({ from: `JARVIS <${user}>`, to: ownerEmail(), subject: `${urgent ? "🚨 " : ""}JARVIS · ${title}`, text: body, html: emailHtml(title, body, urgent), ...(urgent ? { priority: "high" as const } : {}) });
    return true;
  } catch {
    return false;
  }
}

export type Channel = "email" | "telegram" | "none";
export function channelsReady() {
  return { email: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD), telegram: !!(process.env.TELEGRAM_BOT_TOKEN && telegramChat()), to: ownerEmail() };
}
/** Send to Sanjeev: email first, then Telegram. Urgent ones (reminders) also ring his phone (push call). */
export async function notifyOwner(title: string, body: string, o: { urgent?: boolean; dry?: (t: string) => void } = {}): Promise<Channel> {
  if (o.dry) {
    o.dry(`${o.urgent ? "🚨 " : ""}${title}\n\n${body}`);
    return "none";
  }
  if (o.urgent) await callNow(`${title}. ${body}`.slice(0, 300), "note", undefined, true).catch(() => null);
  let ch: Channel = "none";
  if (await email(title, body, !!o.urgent)) ch = "email";
  else if (await telegram(`${o.urgent ? "🚨 " : ""}${title}\n\n${body}`).catch(() => false)) ch = "telegram";
  if (ch !== "none") await saveConfig({ ...(await loadConfig()), lastSent: { at: Date.now(), channel: ch, title } });
  return ch;
}

/* ---------------- content ---------------- */
type Hub = {
  tasks?: { title: string; done: boolean; priority: string; due?: string; doneAt?: number }[];
  reminders?: { id: string; at: string; text: string; fired?: boolean }[];
  timetable?: { date: string; blocks: { start: string; end: string; title: string; kind: string }[] } | null;
  dsa?: { start?: string; solved?: Record<string, string> };
  jobs?: { applied?: Record<string, { at: string }> };
  focus?: Record<string, number>;
  autopilot?: { at: number; mails: { subject: string; urgent: boolean }[]; drafts: { status: string }[] } | null;
};
const istParts = (d = new Date()) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hm: `${hour}:${g("minute")}` };
};

async function leetDaily() {
  try {
    const r = await fetch("https://leetcode.com/graphql", { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" }, body: JSON.stringify({ query: "query { activeDailyCodingChallengeQuestion { link question { title difficulty } } }" }), signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { data?: { activeDailyCodingChallengeQuestion?: { link: string; question: { title: string; difficulty: string } } } };
    return j.data?.activeDailyCodingChallengeQuestion ?? null;
  } catch {
    return null;
  }
}
async function topJobs(log: Log, n: number, mark: boolean) {
  try {
    const { jobs } = await import("./jobs");
    const c = await jobs();
    const fresh = c.list.filter((j) => j.region !== "Global" && (j.ai?.fit ?? j.match) >= 70 && !log[`job:${j.id}`]).slice(0, n);
    if (mark) for (const j of fresh) log[`job:${j.id}`] = Date.now();
    return fresh;
  } catch {
    return [];
  }
}

export async function briefText(h: Hub, log: Log, markJobs = true) {
  const { date } = istParts();
  const d = dayFor(h.dsa?.start || date);
  const lc = await leetDaily();
  const jobs = await topJobs(log, 4, markJobs);
  const open = (h.tasks ?? []).filter((t) => !t.done);
  const focus = open.filter((t) => t.priority === "high" || (t.due && t.due <= date)).slice(0, 5);
  const ap = h.autopilot && Date.now() - h.autopilot.at < 18 * 3_600_000 ? h.autopilot : null;
  return [
    "☀️ Good morning, Sanjeev.",
    `📚 DSA Day ${d.day}: ${d.topic} (${d.problems.map((p) => p.title).join(", ")})`,
    lc ? `🧩 LeetCode daily: ${lc.question.title} (${lc.question.difficulty}) https://leetcode.com${lc.link}` : "",
    h.timetable?.date === date ? `🗓 Today: ${h.timetable.blocks.map((b) => `${b.start} ${b.title}`).join(" · ")}` : "🗓 No plan yet: ask JARVIS to “plan my day” in the hub.",
    focus.length ? `✅ Focus: ${focus.map((t) => t.title).join(" · ")}` : "",
    jobs.length ? `💼 New openings:\n${jobs.map((j) => `• ${j.title} · ${j.company} (${j.ai?.fit ?? j.match}%) ${j.url}`).join("\n")}` : "",
    ap ? `📬 While you slept: ${ap.mails.length} mail triaged, ${ap.drafts.filter((x) => x.status === "pending").length} reply draft(s) waiting for your OK in the hub.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
function reportText(h: Hub) {
  const { date } = istParts();
  const done = (h.tasks ?? []).filter((t) => t.done && t.doneAt && istParts(new Date(t.doneAt)).date === date);
  const solved = Object.values(h.dsa?.solved ?? {}).filter((x) => x === date).length;
  const applied = Object.values(h.jobs?.applied ?? {}).filter((a) => a.at.slice(0, 10) === date).length;
  const overdue = (h.tasks ?? []).filter((t) => !t.done && t.due && t.due <= date);
  const next = DSA.find((x) => x.day === (dayFor(h.dsa?.start || date).day % DSA.length) + 1);
  return [
    `🌙 Today: ${done.length} tasks done · ${solved} DSA solved · ${h.focus?.[date] ?? 0} focus min · ${applied} applications`,
    done.length ? `✅ ${done.map((t) => t.title).join(" · ")}` : "",
    overdue.length ? `⏳ Still open: ${overdue.map((t) => t.title).join(" · ")}` : "",
    next ? `📚 Tomorrow's DSA: ${next.topic}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ---------------- the heartbeat ---------------- */
const IMPORTANT = new Set(["work", "dsa", "learn", "jobs"]);
export type TickResult = { sent: string[]; channel: Channel[] };
/**
 * Everything that is due right now. Safe to run every minute from several places.
 * opts.brief / opts.report: send them if due today (cron and the daemon); opts.dry prints instead of sending.
 */
export async function tick(opts: { dry?: (t: string) => void; now?: Date } = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const { date, hm } = istParts(now);
  const raw = await readState().catch(() => null);
  const h: Hub = raw ? (JSON.parse(raw) as Hub) : {};
  const log = await loadLog();
  const res: TickResult = { sent: [], channel: [] };
  const persist = () => (opts.dry ? Promise.resolve() : saveLog(log)); // a dry run never touches the real log
  const send = async (key: string, title: string, body: string, o: { urgent?: boolean } = {}) => {
    if (log[key]) return;
    log[key] = Date.now(); // claim first so a parallel scheduler skips it
    await persist();
    const ch = await notifyOwner(title, body, { ...o, dry: opts.dry });
    res.sent.push(key);
    res.channel.push(ch);
  };
  // 1) reminders (local IST wall-clock "YYYY-MM-DDTHH:MM"); late by up to 6 h is still worth sending
  for (const r of h.reminders ?? []) {
    const stamp = `${date}T${hm}`;
    if (r.at <= stamp && r.at >= istStamp(new Date(now.getTime() - 6 * 3_600_000))) await send(`rem:${r.id}`, "⏰ Reminder", r.text, { urgent: true });
  }
  // 2) plan: the important blocks (work, DSA, learning, job hunting) as they start; breaks and personal time stay quiet
  if (h.timetable?.date === date)
    for (const b of h.timetable.blocks)
      if (b.start <= hm && b.end > hm && IMPORTANT.has(b.kind)) {
        const next = h.timetable.blocks.find((x) => x.start >= b.end);
        await send(`block:${date}:${b.start}:${b.title}`, `Now: ${b.title}`, `${b.start}–${b.end} · ${b.title}${next ? `\nNext: ${next.start} ${next.title}` : ""}`);
      }
  // 3) morning brief (from 08:00) and nightly report (from 21:30), once a day
  const briefAt = process.env.JARVIS_BRIEF_AT ?? "08:00";
  const reportAt = process.env.JARVIS_REPORT_AT ?? "21:30";
  if (hm >= briefAt && hm < reportAt && !log[`brief:${date}`]) await send(`brief:${date}`, "Morning brief", await briefText(h, log, !opts.dry));
  if (hm >= reportAt && !log[`report:${date}`]) await send(`report:${date}`, "Nightly report", reportText(h));
  // 4) strong new job openings, at most every 3 hours between 09:00 and 21:00
  const slot = `${date}:${Math.floor(Number(hm.slice(0, 2)) / 3)}`;
  if (hm >= "09:00" && hm < "21:00" && !log[`jobslot:${slot}`] && log[`brief:${date}`]) {
    log[`jobslot:${slot}`] = Date.now();
    const jobs = await topJobs(log, 3, !opts.dry);
    await persist();
    if (jobs.length) await send(`jobs:${slot}`, "💼 New job openings", jobs.map((j) => `• ${j.title} · ${j.company} (${j.ai?.fit ?? j.match}%)\n  ${j.url}`).join("\n"));
  }
  // 5) scheduled phone calls
  if (!opts.dry) await fireDue(now.getTime()).catch(() => 0);
  await persist();
  return res;
}
function istStamp(d: Date) {
  const p = istParts(d);
  return `${p.date}T${p.hm}`;
}
