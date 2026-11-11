import { existsSync } from "node:fs";
import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { chatJson } from "@/lib/llm/free";

export const maxDuration = 300;

/**
 * Site Doctor: JARVIS hands the site to a QA agent that walks it like a visitor, then writes an action plan.
 *   quick: crawls every same-site page over HTTP: status codes, broken links, titles, alt text, mixed content, slow pages
 *   deep (on the Mac, with Chrome): also opens each page at desktop and phone size, clicks safe buttons, and records
 *          crashes, console errors, failed requests and sideways scrolling
 * Nothing is changed on the site; fixes become tasks only when Sanjeev approves them in the hub.
 */
const Body = z.object({ url: z.url().max(300), deep: z.boolean().default(false) });
type Finding = { severity: "high" | "medium" | "low"; kind: string; where: string; detail: string };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 JARVIS-SiteDoctor";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function quick(start: URL, findings: Finding[]) {
  const seen = new Set<string>();
  const queue = [start.href];
  const external = new Set<string>();
  const pages: { url: string; status: number; ms: number }[] = [];
  while (queue.length && pages.length < 30) {
    const u = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const t0 = Date.now();
    let r: Response;
    try {
      r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      findings.push({ severity: "high", kind: "Page unreachable", where: u, detail: String((e as Error).message) });
      continue;
    }
    const ms = Date.now() - t0;
    pages.push({ url: u, status: r.status, ms });
    if (r.status >= 400) {
      findings.push({ severity: r.status >= 500 ? "high" : "medium", kind: `HTTP ${r.status}`, where: u, detail: "This page returns an error status." });
      continue;
    }
    if (ms > 3000) findings.push({ severity: "medium", kind: "Slow page", where: u, detail: `Took ${(ms / 1000).toFixed(1)} s to respond.` });
    if (!(r.headers.get("content-type") ?? "").includes("text/html")) continue;
    const html = await r.text();
    if (!/<title>[^<]{3,}<\/title>/i.test(html)) findings.push({ severity: "low", kind: "Missing title", where: u, detail: "No <title>, which hurts search results and browser tabs." });
    if (!/<meta[^>]+name="description"/i.test(html)) findings.push({ severity: "low", kind: "Missing meta description", where: u, detail: "Search engines show no summary for this page." });
    const noAlt = [...html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)].length;
    if (noAlt) findings.push({ severity: "low", kind: "Images without alt text", where: u, detail: `${noAlt} image(s) have no alt text (screen readers can't describe them).` });
    if (start.protocol === "https:" && /\s(src|href)="http:\/\//i.test(html)) findings.push({ severity: "medium", kind: "Mixed content", where: u, detail: "Loads http:// resources on an https page." });
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
      let next: URL;
      try {
        next = new URL(m[1], u);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(next.protocol)) continue;
      if (next.origin === start.origin) {
        if (!/\.(png|jpe?g|webp|svg|ico|css|js|pdf|xml|txt|json)$/i.test(next.pathname) && !next.pathname.startsWith("/api/")) queue.push(next.origin + next.pathname);
      } else external.add(next.href);
    }
  }
  // external links: check a sample for dead ones
  await Promise.all(
    [...external].slice(0, 25).map(async (href) => {
      try {
        const r = await fetch(href, { method: "GET", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
        // 999 / 403 / 429 are sites refusing bots (LinkedIn, Instagram), not broken links
        if ((r.status === 404 || r.status === 410 || (r.status >= 500 && r.status < 600)) && !/linkedin\.com|instagram\.com/.test(href)) findings.push({ severity: "medium", kind: "Broken external link", where: href, detail: `Returns ${r.status}.` });
      } catch {}
    }),
  );
  return pages;
}

async function deep(pages: string[], findings: Finding[]) {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    for (const url of pages.slice(0, 12)) {
      for (const [w, h, mobile] of [
        [1366, 850, false],
        [390, 844, true],
      ] as const) {
        const page = await browser.newPage();
        const where = `${url} (${mobile ? "phone" : "desktop"})`;
        page.on("pageerror", (e) => findings.push({ severity: "high", kind: "JavaScript crash", where, detail: String((e as Error).message).slice(0, 200) }));
        page.on("console", (m) => {
          if (m.type() === "error" && !/favicon|instagram|youtube|ytimg|status of 401/i.test(m.text())) findings.push({ severity: "medium", kind: "Console error", where, detail: m.text().slice(0, 200) });
        });
        page.on("response", (r) => {
          if (r.status() >= 400 && new URL(r.url()).origin === new URL(url).origin && !r.url().includes("/api/")) findings.push({ severity: "medium", kind: `Failed request ${r.status()}`, where, detail: r.url() });
        });
        try {
          await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
          await page.goto(url, { waitUntil: "load", timeout: 30_000 });
          await new Promise((r) => setTimeout(r, 1500));
          const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          if (over > 2) findings.push({ severity: "medium", kind: "Sideways scrolling", where, detail: `The page is ${over}px wider than the screen.` });
          // click like a visitor: safe buttons only (no form submits, nothing destructive)
          const n = await page.evaluate(() => {
            const btns = [...document.querySelectorAll("button")].filter((b) => {
              const t = (b.textContent ?? "").toLowerCase();
              return b.offsetParent && b.type !== "submit" && !b.closest("form") && !/delete|remove|sign out|log ?out|lock|send|pay|buy/.test(t);
            });
            return btns.slice(0, 8).length;
          });
          for (let i = 0; i < n; i++) {
            await page
              .evaluate((i) => {
                const btns = [...document.querySelectorAll("button")].filter((b) => {
                  const t = (b.textContent ?? "").toLowerCase();
                  return b.offsetParent && b.type !== "submit" && !b.closest("form") && !/delete|remove|sign out|log ?out|lock|send|pay|buy/.test(t);
                });
                (btns[i] as HTMLButtonElement | undefined)?.click();
              }, i)
              .catch(() => null);
            await new Promise((r) => setTimeout(r, 400));
          }
        } catch (e) {
          findings.push({ severity: "high", kind: "Page failed to load", where, detail: String((e as Error).message).slice(0, 200) });
        } finally {
          await page.close().catch(() => null);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

const Plan = z.object({ summary: z.string(), steps: z.array(z.object({ title: z.string(), why: z.string(), priority: z.enum(["now", "soon", "later"]) })).max(12) });

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Give a full http(s) address." }, { status: 400 });
  const start = new URL(parsed.data.url);
  const findings: Finding[] = [];
  const t0 = Date.now();
  const pages = await quick(start, findings);
  const canDeep = parsed.data.deep && !process.env.VERCEL && existsSync(CHROME);
  if (canDeep) {
    try {
      await deep(
        pages.filter((p) => p.status < 400).map((p) => p.url),
        findings,
      );
    } catch (e) {
      findings.push({ severity: "low", kind: "Deep check skipped", where: "Chrome", detail: String((e as Error).message).slice(0, 160) });
    }
  }
  // de-duplicate (the same error on many pages)
  const uniq = new Map<string, Finding & { count: number }>();
  for (const f of findings) {
    const k = `${f.kind}|${f.detail}`;
    const prev = uniq.get(k);
    if (prev) prev.count++;
    else uniq.set(k, { ...f, count: 1 });
  }
  const list = [...uniq.values()].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  let plan: z.infer<typeof Plan> | null = null;
  if (list.length) {
    try {
      plan = await chatJson({
        system: "You are a senior engineer reviewing a QA report for a personal portfolio website (Next.js on Vercel). Write a short summary and a prioritised action plan: concrete fixes, each with why it matters. Group duplicates. Be specific and practical.",
        user: `SITE ${start.origin}\nPAGES CHECKED ${pages.length}${canDeep ? " (also in Chrome at desktop and phone size, clicking buttons)" : ""}\nFINDINGS\n${list
          .slice(0, 40)
          .map((f) => `- [${f.severity}] ${f.kind} ×${f.count} at ${f.where}: ${f.detail}`)
          .join("\n")}`,
        schema: z.toJSONSchema(Plan),
        parse: (x) => {
          const r = Plan.safeParse(x);
          return r.success ? { success: true, data: r.data } : { success: false, error: { message: r.error.message } };
        },
        maxTokens: 1500,
      });
    } catch {
      plan = null;
    }
  }
  plan ??= {
    summary: list.length ? `${list.length} issue type(s) found across ${pages.length} page(s).` : `No problems found across ${pages.length} page(s). Nice.`,
    steps: list.slice(0, 8).map((f) => ({ title: `Fix: ${f.kind}${f.count > 1 ? ` (×${f.count})` : ""}`, why: `${f.detail} (${f.where})`, priority: f.severity === "high" ? "now" : f.severity === "medium" ? "soon" : "later" })),
  };
  return Response.json({ origin: start.origin, pages: pages.length, deep: canDeep, seconds: Math.round((Date.now() - t0) / 1000), findings: list, plan });
}
