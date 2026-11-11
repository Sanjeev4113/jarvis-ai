#!/usr/bin/env node
/**
 * JARVIS Mac agent: lets the JARVIS web app (your portfolio's private hub) see your screen, find and read your
 * documents, open apps/links and create reminders/events, ONLY with your permission.
 *
 * Safety model
 *  - Listens on 127.0.0.1 only (not reachable from the network).
 *  - Every request needs the pairing token (~/.jarvis/token) and must come from an allowed origin.
 *  - Every action except a plain notification shows a native macOS dialog: Deny / Allow once
 *    (read-only actions also offer "Allow 10 min"). No answer in 60 s = denied.
 *  - Documents: only inside JARVIS_FOLDERS (default ~/Documents, ~/Desktop, ~/Downloads). No arbitrary shell commands.
 *  - Every action is logged to ~/.jarvis/log.jsonl.
 *
 * Run:  node jarvis/agent.mjs        (Node 18+, macOS, no npm install needed)
 * Env:  JARVIS_PORT=7777  JARVIS_ORIGINS=http://localhost:3000,https://your-site.vercel.app  JARVIS_FOLDERS=Documents,Desktop,Downloads
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const run = promisify(execFile);
const VERSION = "1.0.0";
const PORT = Number(process.env.JARVIS_PORT || 7777);
const HOME = os.homedir();
const DIR = path.join(HOME, ".jarvis");
const ROOTS = (process.env.JARVIS_FOLDERS || "Documents,Desktop,Downloads").split(",").map((f) => path.resolve(HOME, f.trim()));
const ORIGINS = new Set((process.env.JARVIS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,https://sanjeev-portfolio.vercel.app").split(",").map((s) => s.trim().replace(/\/$/, "")));
const READ_ONLY = new Set(["screenshot", "list_docs", "read_doc", "clipboard_read"]);
const TEXT_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".yaml", ".yml", ".xml", ".log", ".tex", ".java", ".ts", ".tsx", ".js", ".mjs", ".py", ".sql", ".sh", ".properties", ".ini", ".toml", ".css", ".html"]);
const RICH_EXT = new Set([".docx", ".doc", ".rtf", ".rtfd", ".odt", ".webarchive", ".wordml"]);

mkdirSync(DIR, { recursive: true, mode: 0o700 });
const TOKEN_FILE = path.join(DIR, "token");
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, crypto.randomBytes(24).toString("base64url"), { mode: 0o600 });
chmodSync(TOKEN_FILE, 0o600);
const TOKEN = readFileSync(TOKEN_FILE, "utf8").trim();
const LOG = path.join(DIR, "log.jsonl");
const log = (e) => {
  try {
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n", { mode: 0o600 });
  } catch {}
};

let trustedUntil = 0; // "Allow 10 min" for read-only actions

/* ---------- native confirmation ---------- */

async function ask(message, readOnly) {
  if (readOnly && Date.now() < trustedUntil) return true;
  const buttons = readOnly ? '{"Deny", "Allow 10 min", "Allow once"}' : '{"Deny", "Allow once"}';
  const script = [
    "on run argv",
    "activate",
    `set r to display dialog (item 1 of argv) with title "JARVIS" buttons ${buttons} default button "Deny" cancel button "Deny" with icon caution giving up after 60`,
    'if gave up of r then return "Deny"',
    "return button returned of r",
    "end run",
  ];
  try {
    const { stdout } = await run("osascript", [...script.flatMap((l) => ["-e", l]), message], { timeout: 65_000 });
    const b = stdout.trim();
    if (b === "Allow 10 min") trustedUntil = Date.now() + 10 * 60_000;
    return b === "Allow once" || b === "Allow 10 min";
  } catch {
    return false; // Deny (cancel button) or error
  }
}

/* ---------- helpers ---------- */

const tilde = (p) => (p.startsWith(HOME) ? "~" + p.slice(HOME.length) : p);
async function insideRoots(p) {
  const abs = path.resolve(p.replace(/^~(?=$|\/)/, HOME));
  let real;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new Error("File not found.");
  }
  if (!ROOTS.some((r) => real === r || real.startsWith(r + path.sep))) throw new Error(`Only files inside ${ROOTS.map(tilde).join(", ")} can be read.`);
  return real;
}
async function walk(dir, depth, out) {
  if (out.length > 400) return;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !/node_modules|\.app$/.test(e.name)) await walk(p, depth - 1, out);
    else if (e.isFile()) {
      try {
        const st = await fs.stat(p);
        out.push({ path: tilde(p), name: e.name, size: st.size, modified: st.mtime.toISOString() });
      } catch {}
    }
  }
}
/** On-device OCR with Apple's Vision framework (nothing leaves the Mac). Works on JPEGs. */
const OCR = "ObjC.import('Vision'); function run(argv) { const h = $.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(argv[0]), $.NSDictionary.dictionary); const r = $.VNRecognizeTextRequest.alloc.init; r.recognitionLevel = 0; h.performRequestsError($.NSArray.arrayWithObject(r), Ref()); const res = r.results; const out = []; if (!res.isNil()) for (let i = 0; i < res.count; i++) { const c = res.objectAtIndex(i).topCandidates(1); if (c.count) out.push(c.objectAtIndex(0).string.js); } return out.join('\\n'); }";
async function ocr(jpg) {
  try {
    return (await run("osascript", ["-l", "JavaScript", "-e", OCR, jpg], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
  } catch {
    return "";
  }
}
const jxa = (fn, ...args) => run("osascript", ["-l", "JavaScript", "-e", fn, ...args], { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 });

/* ---------- actions ---------- */

const ACTIONS = {
  async screenshot() {
    const f = path.join(os.tmpdir(), `jarvis-${crypto.randomUUID()}.jpg`);
    try {
      await run("screencapture", ["-x", "-t", "jpg", f]);
      const text = await ocr(f);
      await run("sips", ["-Z", "1600", "-s", "formatOptions", "70", f]).catch(() => null);
      const b = await fs.readFile(f);
      return { image: `data:image/jpeg;base64,${b.toString("base64")}`, text: text.slice(0, 20_000), note: "If the image is only your wallpaper, allow Screen Recording for Terminal/Node in System Settings → Privacy & Security." };
    } finally {
      fs.rm(f, { force: true }).catch(() => null);
    }
  },
  async list_docs({ query, folder } = {}) {
    if (query) {
      const q = String(query).slice(0, 100);
      const { stdout } = await run("mdfind", [...ROOTS.flatMap((r) => ["-onlyin", r]), q], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
      const files = stdout.split("\n").filter(Boolean).slice(0, 60);
      const out = [];
      for (const p of files)
        try {
          const st = await fs.stat(p);
          if (st.isFile()) out.push({ path: tilde(p), name: path.basename(p), size: st.size, modified: st.mtime.toISOString() });
        } catch {}
      return { files: out };
    }
    const dirs = folder ? [await insideRoots(String(folder))] : ROOTS;
    const out = [];
    for (const d of dirs) await walk(d, 2, out);
    out.sort((a, b) => b.modified.localeCompare(a.modified));
    return { files: out.slice(0, 80) };
  },
  async read_doc({ path: p } = {}) {
    if (!p) throw new Error("Which file?");
    const real = await insideRoots(String(p));
    const ext = path.extname(real).toLowerCase();
    let text = "";
    if (TEXT_EXT.has(ext)) text = await fs.readFile(real, "utf8");
    else if (RICH_EXT.has(ext)) text = (await run("textutil", ["-convert", "txt", "-stdout", real], { maxBuffer: 20 * 1024 * 1024 })).stdout;
    else if (ext === ".pdf")
      text = (await jxa("ObjC.import('PDFKit'); function run(argv) { const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0])); return d.isNil() ? '' : d.string.js; }", real)).stdout;
    else if ([".png", ".jpg", ".jpeg", ".heic", ".tiff", ".gif", ".bmp"].includes(ext)) {
      const tmp = path.join(os.tmpdir(), `jarvis-${crypto.randomUUID()}.jpg`);
      try {
        await run("sips", ["-s", "format", "jpeg", real, "--out", tmp]);
        text = await ocr(tmp);
      } finally {
        fs.rm(tmp, { force: true }).catch(() => null);
      }
    } else throw new Error(`Can't read ${ext || "this"} files yet (text, Word, RTF, PDF and images work).`);
    const max = 60_000;
    return { path: tilde(real), text: text.slice(0, max), truncated: text.length > max, chars: text.length };
  },
  async open_url({ url } = {}) {
    const u = new URL(String(url));
    if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links.");
    await run("open", [u.href]);
    return { opened: u.href };
  },
  async open_app({ name } = {}) {
    if (!/^[\w .&'+-]{1,60}$/.test(String(name))) throw new Error("That doesn't look like an app name.");
    await run("open", ["-a", String(name)]);
    return { opened: name };
  },
  async notify({ title = "JARVIS", text = "" } = {}) {
    await run("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv) sound name \"Glass\"", "-e", "end run", String(title).slice(0, 80), String(text).slice(0, 300)]);
    return { shown: true };
  },
  async create_reminder({ title, due } = {}) {
    if (!title) throw new Error("A reminder needs a title.");
    await jxa("function run(argv) { const R = Application('Reminders'); const p = { name: argv[0] }; if (argv[1]) p.dueDate = new Date(argv[1]); const r = R.Reminder(p); R.defaultList().reminders.push(r); return 'ok'; }", String(title).slice(0, 200), due ? String(due) : "");
    return { created: title, due: due ?? null };
  },
  async create_event({ title, start, end } = {}) {
    if (!title || !start) throw new Error("An event needs a title and a start time.");
    const s = new Date(String(start));
    const e = end ? new Date(String(end)) : new Date(s.getTime() + 60 * 60_000);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error("Couldn't read the date/time.");
    await jxa(
      "function run(argv) { const C = Application('Calendar'); const cal = C.calendars().find((c) => { try { return c.writable(); } catch (e) { return false; } }); if (!cal) throw new Error('No writable calendar'); cal.events.push(C.Event({ summary: argv[0], startDate: new Date(argv[1]), endDate: new Date(argv[2]) })); return cal.name(); }",
      String(title).slice(0, 200),
      s.toISOString(),
      e.toISOString(),
    );
    return { created: title, start: s.toISOString(), end: e.toISOString() };
  },
  async clipboard_read() {
    const { stdout } = await run("pbpaste", [], { maxBuffer: 4 * 1024 * 1024 });
    return { text: stdout.slice(0, 20_000) };
  },
  async clipboard_write({ text = "" } = {}) {
    await new Promise((resolve, reject) => {
      const p = execFile("pbcopy", (err) => (err ? reject(err) : resolve()));
      p.stdin.end(String(text).slice(0, 100_000));
    });
    return { copied: String(text).length };
  },
  async run_shortcut({ name } = {}) {
    if (!name || String(name).length > 80) throw new Error("Which Shortcut?");
    const { stdout } = await run("shortcuts", ["run", String(name)], { timeout: 120_000 });
    return { ran: name, output: stdout.slice(0, 4000) };
  },
};

function describe(action, a = {}, reason = "") {
  const why = reason ? `\n\nReason: ${String(reason).slice(0, 200)}` : "";
  const d = {
    screenshot: "take a screenshot of your screen",
    list_docs: a.query ? `search your documents for "${a.query}"` : `list recent files in ${a.folder ?? ROOTS.map(tilde).join(", ")}`,
    read_doc: `read the file ${a.path}`,
    open_url: `open ${a.url}`,
    open_app: `open the app "${a.name}"`,
    create_reminder: `create a reminder "${a.title}"${a.due ? ` due ${a.due}` : ""}`,
    create_event: `add a calendar event "${a.title}" at ${a.start}`,
    clipboard_read: "read your clipboard",
    clipboard_write: `copy ${String(a.text ?? "").length} characters to your clipboard`,
    run_shortcut: `run your Shortcut "${a.name}"`,
  }[action];
  return `JARVIS wants to ${d}.${why}`;
}

/* ---------- server ---------- */

function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGINS.has(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  return !o || ORIGINS.has(o);
}
const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
const authed = (req) => {
  const got = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
};

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return json(res, 403, { error: "origin not allowed" });
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  if (!authed(req)) return json(res, 401, { error: "pair first: paste the token from ~/.jarvis/token" });
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/status") return json(res, 200, { ok: true, name: "JARVIS agent", version: VERSION, host: os.hostname(), platform: process.platform, folders: ROOTS.map(tilde), trusted: Date.now() < trustedUntil });
  if (req.method === "POST" && url.pathname === "/act") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 200_000) return json(res, 413, { error: "too large" });
    }
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "bad json" });
    }
    const { action, args = {}, reason = "" } = msg ?? {};
    const fn = ACTIONS[action];
    if (!fn) return json(res, 400, { error: `unknown action ${action}` });
    if (action !== "notify") {
      const ok = await ask(describe(action, args, reason), READ_ONLY.has(action));
      if (!ok) {
        log({ action, approved: false });
        return json(res, 403, { error: "Sanjeev denied this on the Mac." });
      }
    }
    try {
      const result = await fn(args);
      log({ action, approved: true, args: action === "clipboard_write" ? { chars: String(args.text ?? "").length } : args });
      return json(res, 200, { ok: true, result });
    } catch (e) {
      log({ action, approved: true, error: String(e.message ?? e) });
      return json(res, 500, { error: String(e.message ?? e).slice(0, 300) });
    }
  }
  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  JARVIS agent v${VERSION} listening on http://127.0.0.1:${PORT}`);
  console.log(`  Allowed sites: ${[...ORIGINS].join(", ")}`);
  console.log(`  Readable folders: ${ROOTS.map(tilde).join(", ")}`);
  console.log(`  Pairing token (paste once in JARVIS → Mac agent):\n\n    ${TOKEN}\n`);
});
