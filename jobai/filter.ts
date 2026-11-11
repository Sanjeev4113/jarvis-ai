/** Cheap, deterministic filtering before any model sees a job. */
import type { Job } from "./sources";

const ROLE = [
  /\b(software|backend|back[- ]end|full[- ]?stack|frontend|front[- ]end|platform|application|product|java|spring|node(\.js)?|typescript|react|mern|web)\b.*\b(engineer|developer|sde|dev)\b/i,
  /\b(sde|swe)\b/i,
  /\bsoftware (engineer|developer)\b/i,
  /\b(sdet|qa automation|test automation|automation test|quality engineer|qa engineer|software development engineer in test)\b/i,
  /\b(devops|site reliability|sre|platform engineer|cloud engineer|infrastructure engineer)\b/i,
  /\b(ai|ml|llm|genai|applied ai|machine learning)\b.*\b(engineer|developer)\b/i,
  /\bsoftware engineering\b.*\b(a?mts|member of technical staff)\b/i, // Salesforce-style "Software Engineering AMTS/MTS"
  /\b(a?mts|member of technical staff)\b/i,
];
const TOO_SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|architect|vp|distinguished|fellow|iii|iv)\b/i;
const NOT_TECH = /\b(sales|account executive|recruit|marketing|designer|counsel|legal|finance|accountant|support specialist|customer success)\b/i;
const INTERN = /\b(intern|internship|apprentice)\b/i;

/** Pull "N+ years" requirements out of a description; jobs asking for 4+ years are skipped. */
export function minYears(desc: string) {
  let min = 0;
  for (const m of desc.matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to|–)?\s*(\d{1,2})?\s*\+?\s*(?:years|yrs)/gi)) {
    const a = Number(m[1]);
    if (a > 0 && a < 20) min = Math.max(min, a);
  }
  return min;
}

export function relevant(job: Job) {
  const t = job.title;
  if (!ROLE.some((r) => r.test(t))) return false;
  // "Member of Technical Staff" / AMTS / MTS are entry-to-mid levels; LMTS / SMTS / PMTS are senior
  if (/\b(lmts|smts|pmts)\b/i.test(t)) return false;
  const title = t.replace(/member of technical staff/gi, "MTS");
  if (TOO_SENIOR.test(title) || NOT_TECH.test(title) || INTERN.test(title)) return false;
  if (minYears(job.description.slice(0, 6000)) >= 4) return false;
  return true;
}

export function fresh(job: Job, days = 21) {
  if (!job.posted) return true;
  const t = Date.parse(job.posted);
  return Number.isNaN(t) || Date.now() - t < days * 86_400_000;
}

/** Quick keyword overlap, used to pre-rank and when no Claude key is set. */
const KEYWORDS = ["java", "spring", "spring boot", "microservice", "rest", "postgres", "sql", "typescript", "javascript", "react", "node", "mongodb", "express", "cypress", "playwright", "selenium", "jenkins", "ci/cd", "linux", "docker", "kafka", "camel", "python", "api", "backend", "full stack", "aws", "kubernetes", "llm", "ai"];
export function keywordScore(job: Job) {
  const d = `${job.title} ${job.description}`.toLowerCase();
  const hits = KEYWORDS.filter((k) => d.includes(k));
  return { score: Math.min(100, Math.round((hits.length / 12) * 100)), hits };
}

export function locationRank(job: Job) {
  const l = `${job.location} ${job.remote ? "remote" : ""}`.toLowerCase();
  if (/india|bengaluru|bangalore|pune|hyderabad|chennai|gurgaon|gurugram|noida|mumbai|delhi/.test(l)) return 3;
  if (job.remote || /remote|anywhere|worldwide/.test(l)) return 2;
  return 1;
}
