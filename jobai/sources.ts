/**
 * Job sources: only official, public job-board APIs (no scraping, no logins).
 *  - Greenhouse, Lever, Ashby and SmartRecruiters publish each company's open roles as JSON.
 *  - Remotive and Arbeitnow publish remote / international roles.
 *  - Adzuna and Jooble (worldwide aggregators) are used when their free API keys are set.
 * Add companies to COMPANIES to widen the net.
 */

export type Job = {
  id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  posted?: string;
  /** the board only gives the day ("Posted Today"), not the time */
  postedDay?: boolean;
};

export const COMPANIES = {
  greenhouse: ["anthropic", "stripe", "databricks", "twilio", "mongodb", "okta", "gitlab", "cloudflare", "elastic", "rubrik", "airbnb", "coinbase", "dropbox", "figma", "zscaler", "datadog", "pinterest", "robinhood"],
  lever: ["cred", "paytm", "meesho", "zeta", "spotify", "palantir"],
  ashby: ["openai", "notion", "ramp", "linear", "perplexity", "sarvam"],
  smartrecruiters: ["ServiceNow", "Freshworks"],
};

const UA = { "User-Agent": "JobAI/1.0 (personal job search; contact via github.com/Sanjeev4113)" };
const text = (html: string) =>
  html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<\/(p|li|h\d|div|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

async function get<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function greenhouse(board: string): Promise<Job[]> {
  type R = { jobs: { id: number; title: string; absolute_url: string; location?: { name: string }; content?: string; updated_at?: string; first_published?: string }[] };
  const d = await get<R>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
  return (d?.jobs ?? []).map((j) => ({
    id: `gh:${board}:${j.id}`,
    source: "Greenhouse",
    company: board,
    title: j.title,
    location: j.location?.name ?? "",
    remote: /remote/i.test(j.location?.name ?? ""),
    url: j.absolute_url,
    description: text(j.content ?? ""),
    posted: j.first_published ?? j.updated_at,
  }));
}

async function lever(company: string): Promise<Job[]> {
  type R = { id: string; text: string; hostedUrl: string; categories?: { location?: string; allLocations?: string[] }; descriptionPlain?: string; lists?: { text: string; content: string }[]; workplaceType?: string; createdAt?: number }[];
  const d = await get<R>(`https://api.lever.co/v0/postings/${company}?mode=json`);
  return (d ?? []).map((j) => ({
    id: `lever:${company}:${j.id}`,
    source: "Lever",
    company,
    title: j.text,
    location: j.categories?.allLocations?.join(", ") || j.categories?.location || "",
    remote: j.workplaceType === "remote" || /remote/i.test(j.categories?.location ?? ""),
    url: j.hostedUrl,
    description: [j.descriptionPlain ?? "", ...(j.lists ?? []).map((l) => `${l.text}\n${text(l.content)}`)].join("\n"),
    posted: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
  }));
}

async function ashby(org: string): Promise<Job[]> {
  type R = { jobs: { id: string; title: string; location: string; isRemote?: boolean; jobUrl: string; descriptionPlain?: string; publishedAt?: string; secondaryLocations?: { location: string }[] }[] };
  const d = await get<R>(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
  return (d?.jobs ?? []).map((j) => ({
    id: `ashby:${org}:${j.id}`,
    source: "Ashby",
    company: org,
    title: j.title,
    location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join(", "),
    remote: !!j.isRemote,
    url: j.jobUrl,
    description: j.descriptionPlain ?? "",
    posted: j.publishedAt,
  }));
}

async function smartrecruiters(company: string): Promise<Job[]> {
  type R = { content: { id: string; name: string; location?: { city?: string; country?: string; remote?: boolean }; releasedDate?: string }[] };
  const seen = new Set<string>();
  const out: Job[] = [];
  // engineering roles worldwide + everything in India
  for (const q of ["q=software%20engineer", "q=developer", "country=in"]) {
    const d = await get<R>(`https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100&${q}`);
    for (const j of d?.content ?? []) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      out.push({
        id: `sr:${company}:${j.id}`,
        source: "SmartRecruiters",
        company,
        title: j.name,
        location: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(", "),
        remote: !!j.location?.remote,
        url: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
        description: "", // fetched later for shortlisted roles only
        posted: j.releasedDate,
      });
    }
  }
  return out;
}

export async function smartrecruitersDetail(job: Job) {
  if (job.source !== "SmartRecruiters" || job.description) return job;
  const [, company, id] = job.id.split(":");
  type R = { jobAd?: { sections?: Record<string, { text?: string }> } };
  const d = await get<R>(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}`);
  const secs = d?.jobAd?.sections ?? {};
  return { ...job, description: text(Object.values(secs).map((s) => s.text ?? "").join("\n")) };
}

async function remotive(): Promise<Job[]> {
  type R = { jobs: { id: number; title: string; company_name: string; url: string; candidate_required_location: string; description: string; publication_date: string }[] };
  const out: Job[] = [];
  for (const cat of ["software-dev", "devops", "qa"]) {
    const d = await get<R>(`https://remotive.com/api/remote-jobs?category=${cat}&limit=100`);
    for (const j of d?.jobs ?? [])
      out.push({
        id: `remotive:${j.id}`,
        source: "Remotive",
        company: j.company_name,
        title: j.title,
        location: j.candidate_required_location || "Remote",
        remote: true,
        url: j.url,
        description: text(j.description),
        posted: j.publication_date,
      });
  }
  return out;
}

async function arbeitnow(): Promise<Job[]> {
  type R = { data: { slug: string; title: string; company_name: string; url: string; location: string; remote: boolean; description: string; created_at: number }[] };
  const d = await get<R>("https://www.arbeitnow.com/api/job-board-api");
  return (d?.data ?? []).map((j) => ({
    id: `arbeitnow:${j.slug}`,
    source: "Arbeitnow",
    company: j.company_name,
    title: j.title,
    location: j.location,
    remote: j.remote,
    url: j.url,
    description: text(j.description),
    posted: new Date(j.created_at * 1000).toISOString(),
  }));
}

/* ---------- Tech giants: their own public career-site APIs (the same JSON their careers pages use) ---------- */

const BROWSER = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** GET with a polite retry when a career site rate-limits us (HTTP 429). */
async function getPolite<T>(url: string, tries = 3): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: BROWSER, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) {
        await sleep(1500 * (i + 1));
        continue;
      }
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function amazon(): Promise<Job[]> {
  type R = { jobs: { id_icims: string; title: string; company_name: string; normalized_location: string; location: string; job_path: string; posted_date: string; description: string; basic_qualifications: string; preferred_qualifications: string }[] };
  const out: Job[] = [];
  for (const q of ["software development engineer", "software engineer", "quality assurance engineer"]) {
    const d = await get<R>(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&loc_query=India&result_limit=100&sort=recent`, { headers: BROWSER });
    for (const j of d?.jobs ?? [])
      out.push({
        id: `amazon:${j.id_icims}`,
        source: "Amazon Jobs",
        company: "Amazon",
        title: j.title,
        location: j.normalized_location || j.location,
        remote: /virtual|remote/i.test(j.location),
        url: `https://www.amazon.jobs${j.job_path}`,
        description: text(`${j.description}<br/>Basic qualifications<br/>${j.basic_qualifications}<br/>Preferred qualifications<br/>${j.preferred_qualifications}`),
        posted: j.posted_date,
      });
  }
  return out;
}

async function microsoft(): Promise<Job[]> {
  type R = { data?: { count: number; positions: { id: number; name: string; locations: string[]; postedTs: number; workLocationOption?: string; positionUrl: string }[] } };
  const out: Job[] = [];
  for (const q of ["software engineer", "software developer"])
    for (let start = 0; start < 60; start += 10) {
      const d = await getPolite<R>(`https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=${encodeURIComponent(q)}&location=India&start=${start}&num=10&sort_by=timestamp`);
      const ps = d?.data?.positions ?? [];
      for (const j of ps)
        out.push({
          id: `msft:${j.id}`,
          source: "Microsoft Careers",
          company: "Microsoft",
          title: j.name,
          location: j.locations.join(", "),
          remote: j.workLocationOption === "remote",
          url: `https://apply.careers.microsoft.com${j.positionUrl}`,
          description: "", // fetched on demand
          posted: new Date(j.postedTs * 1000).toISOString(),
        });
      if (ps.length < 10) break;
      await sleep(700);
    }
  return out;
}

async function oracle(): Promise<Job[]> {
  type R = { items: { requisitionList?: { Id: string; Title: string; PostedDate: string; PrimaryLocation: string; ShortDescriptionStr?: string; WorkplaceType?: string }[] }[] };
  const d = await get<R>(
    "https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=CX_45001,limit=100,keyword=%22software%22,locationId=300000000106947,sortBy=POSTING_DATES_DESC",
    { headers: BROWSER },
  );
  return (d?.items?.[0]?.requisitionList ?? []).map((j) => ({
    id: `oracle:${j.Id}`,
    source: "Oracle Careers",
    company: "Oracle",
    title: j.Title,
    location: j.PrimaryLocation,
    remote: /remote/i.test(j.WorkplaceType ?? ""),
    url: `https://careers.oracle.com/jobs/#en/sites/jobsearch/job/${j.Id}`,
    description: j.ShortDescriptionStr ?? "",
    posted: j.PostedDate,
  }));
}

/** Workday career sites (Salesforce, NVIDIA, Adobe, Intel, Cisco). */
export const WORKDAY = [
  { company: "Salesforce", host: "salesforce.wd12", tenant: "salesforce", site: "External_Career_Site" },
  { company: "NVIDIA", host: "nvidia.wd5", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
  { company: "Adobe", host: "adobe.wd5", tenant: "adobe", site: "external_experienced" },
  { company: "Intel", host: "intel.wd1", tenant: "intel", site: "External" },
  { company: "Cisco", host: "cisco.wd5", tenant: "cisco", site: "Cisco_Careers" },
];
/** Workday only says "Posted Today / Yesterday / N Days Ago": date it at the middle of that day (not "now"), so it
 *  sorts honestly among posts with exact times. */
function workdayPosted(s: string) {
  const days = /today/i.test(s) ? 0 : /yesterday/i.test(s) ? 1 : Number(s.match(/(\d+)\+?\s*days?/i)?.[1] ?? 30);
  const now = Date.now();
  const startToday = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const mid = days === 0 ? (startToday + now) / 2 : startToday - (days - 1) * 86_400_000 - 43_200_000;
  return new Date(Math.min(now, mid)).toISOString();
}
async function workday(w: (typeof WORKDAY)[number]): Promise<Job[]> {
  type R = { total: number; jobPostings: { title: string; externalPath: string; locationsText: string; postedOn: string; bulletFields?: string[] }[] };
  const out: Job[] = [];
  for (const q of ["software engineer India", "software developer India"])
    for (let offset = 0; offset < 60; offset += 20) {
      const d = await get<R>(`https://${w.host}.myworkdayjobs.com/wday/cxs/${w.tenant}/${w.site}/jobs`, {
        method: "POST",
        headers: { ...BROWSER, "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
      });
      const ps = d?.jobPostings ?? [];
      for (const j of ps)
        out.push({
          id: `wd:${w.tenant}:${j.externalPath.split("_").pop()}`,
          source: "Workday",
          company: w.company,
          title: j.title,
          location: j.locationsText,
          remote: /remote/i.test(j.locationsText),
          url: `https://${w.host}.myworkdayjobs.com/${w.site}${j.externalPath}`,
          description: "", // fetched on demand
          posted: workdayPosted(j.postedOn ?? ""),
          postedDay: true,
        });
      if (ps.length < 20) break;
    }
  return out;
}

/** Map with at most `n` requests in flight (be polite to career sites). */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/** Full description for sources whose list API leaves it out (SmartRecruiters, Workday, Microsoft). */
export async function detail(job: Job): Promise<Job> {
  if (job.description.length > 200) return job;
  if (job.source === "SmartRecruiters") return smartrecruitersDetail(job);
  if (job.source === "Workday") {
    const w = WORKDAY.find((x) => job.url.startsWith(`https://${x.host}.`));
    if (!w) return job;
    const p = job.url.slice(`https://${w.host}.myworkdayjobs.com/${w.site}`.length);
    const d = await get<{ jobPostingInfo?: { jobDescription?: string; location?: string; remoteType?: string } }>(`https://${w.host}.myworkdayjobs.com/wday/cxs/${w.tenant}/${w.site}${p}`, { headers: BROWSER });
    const i = d?.jobPostingInfo;
    return i ? { ...job, description: text(i.jobDescription ?? ""), location: i.location ?? job.location, remote: /remote/i.test(i.remoteType ?? "") || job.remote } : job;
  }
  if (job.source === "Microsoft Careers") {
    const id = job.id.split(":")[1];
    const d = await getPolite<{ data?: { jobDescription?: string } }>(`https://apply.careers.microsoft.com/api/pcsx/position_details?position_id=${id}&domain=microsoft.com&hl=en`);
    return d?.data?.jobDescription ? { ...job, description: text(d.data.jobDescription) } : job;
  }
  if (job.source === "Oracle Careers") {
    const id = job.id.split(":")[1];
    type R = { items?: { ExternalDescriptionStr?: string; ExternalQualificationsStr?: string; ExternalResponsibilitiesStr?: string }[] };
    const d = await get<R>(`https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${id}%22,siteNumber=CX_45001`, { headers: BROWSER });
    const i = d?.items?.[0];
    return i ? { ...job, description: text([i.ExternalDescriptionStr, i.ExternalResponsibilitiesStr, i.ExternalQualificationsStr].filter(Boolean).join("<br/>")) } : job;
  }
  return job;
}

/** Adzuna (worldwide aggregator, free key: https://developer.adzuna.com). */
async function adzuna(queries: string[]): Promise<Job[]> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return [];
  type R = { results: { id: string; title: string; company?: { display_name: string }; location?: { display_name: string }; redirect_url: string; description: string; created: string }[] };
  const out: Job[] = [];
  for (const country of ["in", "gb", "us", "sg", "de", "nl", "ca", "au"]) {
    for (const q of queries) {
      const d = await get<R>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=2&what=${encodeURIComponent(q)}`);
      for (const j of d?.results ?? [])
        out.push({
          id: `adzuna:${j.id}`,
          source: "Adzuna",
          company: j.company?.display_name ?? "",
          title: j.title,
          location: j.location?.display_name ?? country.toUpperCase(),
          remote: /remote/i.test(j.title + j.description),
          url: j.redirect_url,
          description: j.description,
          posted: j.created,
        });
    }
  }
  return out;
}

/** Jooble (worldwide aggregator, free key: https://jooble.org/api/about). */
async function jooble(queries: string[]): Promise<Job[]> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return [];
  type R = { jobs: { id: string; title: string; company: string; location: string; link: string; snippet: string; updated: string }[] };
  const out: Job[] = [];
  for (const q of queries) {
    const d = await get<R>(`https://jooble.org/api/${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: q, location: "" }) });
    for (const j of d?.jobs ?? [])
      out.push({ id: `jooble:${j.id}`, source: "Jooble", company: j.company, title: j.title, location: j.location, remote: /remote/i.test(j.location), url: j.link, description: text(j.snippet), posted: j.updated });
  }
  return out;
}

export async function fetchAll(queries: string[]) {
  const tasks: Promise<Job[]>[] = [
    ...COMPANIES.greenhouse.map(greenhouse),
    ...COMPANIES.lever.map(lever),
    ...COMPANIES.ashby.map(ashby),
    ...COMPANIES.smartrecruiters.map(smartrecruiters),
    remotive(),
    arbeitnow(),
    amazon(),
    microsoft(),
    oracle(),
    ...WORKDAY.map(workday),
    adzuna(queries),
    jooble(queries),
  ];
  const results = await Promise.allSettled(tasks);
  const jobs = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const counts: Record<string, number> = {};
  for (const j of jobs) counts[j.source] = (counts[j.source] ?? 0) + 1;
  return { jobs, counts };
}
