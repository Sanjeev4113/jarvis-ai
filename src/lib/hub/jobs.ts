import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUERIES } from "../../../jobai/profile";
import { fresh, keywordScore, locationRank, minYears, relevant } from "../../../jobai/filter";
import { detail, fetchAll, type Job } from "../../../jobai/sources";

/**
 * Every live role that matches Sanjeev's targets, from the same official sources the hourly agent uses
 * (company job boards, the tech giants' career APIs, remote boards). Cached in memory for an hour.
 * Fit scores from the hourly agent's AI screening are merged in when its state file is present.
 */

export type Role = "Backend" | "Full-stack" | "SDET / QA" | "DevOps" | "AI / ML" | "Software Engineer";
export type ListedJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  source: string;
  posted?: string;
  postedDay?: boolean;
  role: Role;
  match: number;
  hits: string[];
  years: number;
  region: "India" | "Remote" | "Global";
  ai?: { fit: number; verdict?: string };
  snippet: string;
};

function role(t: string): Role {
  if (/sdet|qa|quality|test/i.test(t)) return "SDET / QA";
  if (/devops|sre|site reliability|platform|cloud|infrastructure/i.test(t)) return "DevOps";
  if (/\b(ai|ml|llm|genai|machine learning|applied)\b/i.test(t)) return "AI / ML";
  if (/full[- ]?stack|frontend|front[- ]end|react|mern|web/i.test(t)) return "Full-stack";
  if (/backend|back[- ]end|java|spring|api|distributed|server/i.test(t)) return "Backend";
  return "Software Engineer";
}

const COMPANY_NAMES: Record<string, string> = { mongodb: "MongoDB", gitlab: "GitLab", openai: "OpenAI", cred: "CRED", paytm: "Paytm", servicenow: "ServiceNow" };
const nice = (c: string) => COMPANY_NAMES[c.toLowerCase()] ?? (c === c.toLowerCase() ? c.replace(/\b\w/g, (x) => x.toUpperCase()) : c);

/** Every source dates its posts differently ("2026-11-10T13:22:11-05:00", "November 10, 2026", epoch seconds…):
 *  one exact UTC ISO timestamp, so "newest first" and "posted within" compare real times. Future dates are clamped. */
export function postedAt(p?: string | number): string | undefined {
  if (p === undefined || p === null || p === "") return undefined;
  const s = String(p).trim();
  const n = /^\d{10}$/.test(s) ? Number(s) * 1000 : /^\d{13}$/.test(s) ? Number(s) : Date.parse(s);
  if (!Number.isFinite(n) || n < Date.parse("2015-01-01")) return undefined;
  return new Date(Math.min(n, Date.now())).toISOString();
}
export const postedMs = (j: { posted?: string }) => (j.posted ? Date.parse(j.posted) || 0 : 0);

function aiFits() {
  const f = path.join(process.cwd(), "jobai", "state", "state.json");
  const out = new Map<string, { fit: number; verdict?: string }>();
  if (!existsSync(f)) return out;
  try {
    const s = JSON.parse(readFileSync(f, "utf8")) as { history?: { id: string; fit: number; verdict?: string }[] };
    for (const h of s.history ?? []) out.set(h.id, { fit: h.fit, verdict: h.verdict });
  } catch {}
  return out;
}

/** Skills vocabulary for the demand radar: how many matching jobs mention each one. */
export const SKILLS: [name: string, re: RegExp][] = [
  ["Java", /\bjava\b(?!script)/i],
  ["Spring Boot", /spring\s*boot|\bspring\b/i],
  ["Microservices", /micro-?services?/i],
  ["REST APIs", /\brest(ful)?\b|\bapis?\b/i],
  ["SQL", /\bsql\b|postgres|mysql|oracle db/i],
  ["PostgreSQL", /postgres/i],
  ["MongoDB", /mongo/i],
  ["Redis", /\bredis\b/i],
  ["Kafka", /\bkafka\b/i],
  ["Docker", /\bdocker\b|containers?/i],
  ["Kubernetes", /kubernetes|\bk8s\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["Azure", /\bazure\b/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["CI/CD", /ci\s*\/\s*cd|jenkins|github actions|gitlab ci/i],
  ["Linux", /\blinux\b|unix/i],
  ["Python", /\bpython\b/i],
  ["Go", /\bgolang\b|\bgo\b(?= |,)/],
  ["TypeScript", /typescript/i],
  ["JavaScript", /javascript|\bjs\b/i],
  ["React", /\breact\b/i],
  ["Node.js", /node\.?js|\bnode\b/i],
  ["System design", /system design|distributed systems?|scalab/i],
  ["DSA", /data structures|algorithms/i],
  ["Testing", /unit test|junit|test automation|tdd/i],
  ["Cypress", /cypress/i],
  ["Playwright", /playwright/i],
  ["Selenium", /selenium/i],
  ["GraphQL", /graphql/i],
  ["gRPC", /\bgrpc\b/i],
  ["Terraform", /terraform|infrastructure as code/i],
  ["Observability", /observability|prometheus|grafana|opentelemetry|datadog/i],
  ["LLMs / GenAI", /\bllms?\b|generative ai|genai|large language/i],
  ["RAG", /\brag\b|retrieval[- ]augmented/i],
  ["AI agents", /\bagents?\b|agentic/i],
  ["Machine learning", /machine learning|\bml\b/i],
  ["Security", /security|oauth|owasp/i],
];

type Cache = { at: number; list: ListedJob[]; full: Map<string, Job>; counts: Record<string, number>; total: number; demand: { skill: string; jobs: number }[]; described: number };
let cache: Cache | null = null;
let loading: Promise<Cache> | null = null;

async function load(): Promise<Cache> {
  const { jobs, counts } = await fetchAll(QUERIES);
  const fits = aiFits();
  const full = new Map<string, Job>();
  const byKey = new Map<string, ListedJob>();
  for (const j of jobs) {
    if (!relevant(j) || !fresh(j, 30)) continue;
    const company = nice(j.company);
    const k = `${company.toLowerCase()}|${j.title.toLowerCase()}`;
    const loc = locationRank(j);
    const kw = keywordScore(j);
    const years = minYears(j.description.slice(0, 6000));
    const item: ListedJob = {
      id: j.id,
      company,
      title: j.title,
      location: j.location || (j.remote ? "Remote" : ""),
      remote: j.remote,
      url: j.url,
      source: j.source,
      posted: postedAt(j.posted),
      postedDay: j.postedDay,
      role: role(j.title),
      // quick match: keywords, place, and how recently it was posted
      match: Math.min(99, Math.round(kw.score * 0.6 + loc * 10 + (years <= 2 ? 8 : 0) + (j.description ? 0 : 10))),
      hits: kw.hits.slice(0, 8),
      years,
      region: loc === 3 ? "India" : loc === 2 ? "Remote" : "Global",
      ai: fits.get(j.id),
      snippet: j.description.slice(0, 260),
    };
    const prev = byKey.get(k);
    if (prev) {
      // same role in many cities: keep one entry, list the places
      if (!prev.location.includes(item.location)) prev.location = `${prev.location}; ${item.location}`.slice(0, 160);
      if (postedMs(item) > postedMs(prev)) prev.posted = item.posted; // the newest copy decides "posted"
      continue;
    }
    byKey.set(k, item);
    full.set(j.id, { ...j, company });
  }
  const demandMap = new Map<string, number>();
  for (const j of full.values()) {
    const text = `${j.title}\n${j.description}`;
    for (const [name, re] of SKILLS) if (re.test(text)) demandMap.set(name, (demandMap.get(name) ?? 0) + 1);
  }
  const demand = [...demandMap].map(([skill, n]) => ({ skill, jobs: n })).sort((a, b) => b.jobs - a.jobs);
  const list = [...byKey.values()].sort((a, b) => (b.ai?.fit ?? b.match) - (a.ai?.fit ?? a.match) || postedMs(b) - postedMs(a));
  const c: Cache = { at: Date.now(), list, full, counts, total: jobs.length, demand, described: [...full.values()].filter((j) => j.description.length > 200).length };
  cache = c;
  return c;
}

export async function jobs(force = false): Promise<Cache> {
  if (force && cache && Date.now() - cache.at < 90_000) force = false; // a rescan within 90 s returns the fresh list
  if (cache && !force && Date.now() - cache.at < 30 * 60_000) return cache;
  loading ??= load().finally(() => (loading = null));
  if (cache && !force) return cache;
  return loading;
}

export async function job(id: string) {
  const c = await jobs();
  const j = c.full.get(id);
  if (!j) return null;
  const d = await detail(j);
  c.full.set(id, d);
  return d;
}
