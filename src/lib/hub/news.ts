
/**
 * Tech news and posts from the companies Sanjeev follows: official RSS/Atom feeds where they exist,
 * Google News search feeds for companies without one (Anthropic, Oracle, ServiceNow…).
 * Cached in memory for 30 minutes; a refresh serves the old copy while the new one loads.
 */

export type Post = { id: string; company: string; kind: "official" | "press" | "community"; title: string; url: string; summary: string; image?: string; source: string; at: string };

type Feed = { company: string; kind: Post["kind"]; url: string; max?: number };

const gnews = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:7d&hl=en-IN&gl=IN&ceid=IN:en`;

export const FEEDS: Feed[] = [
  { company: "Anthropic", kind: "press", url: gnews('"Anthropic" Claude') },
  { company: "OpenAI", kind: "official", url: "https://openai.com/news/rss.xml" },
  { company: "Google", kind: "official", url: "https://blog.google/rss/" },
  { company: "Google", kind: "official", url: "https://developers.googleblog.com/feeds/posts/default" },
  { company: "Google", kind: "press", url: gnews('"Google DeepMind" OR "Gemini" Google AI'), max: 10 },
  { company: "Microsoft", kind: "official", url: "https://blogs.microsoft.com/feed/" },
  { company: "Microsoft", kind: "official", url: "https://devblogs.microsoft.com/feed/" },
  { company: "Amazon", kind: "official", url: "https://aws.amazon.com/blogs/aws/feed/" },
  { company: "Amazon", kind: "official", url: "https://www.aboutamazon.com/news/rss" },
  { company: "Oracle", kind: "press", url: gnews('"Oracle" cloud OR database OR Java') },
  { company: "Salesforce", kind: "official", url: "https://www.salesforce.com/news/feed/" },
  { company: "Salesforce", kind: "official", url: "https://engineering.salesforce.com/feed/" },
  { company: "ServiceNow", kind: "press", url: gnews('"ServiceNow"') },
  { company: "Meta", kind: "official", url: "https://engineering.fb.com/feed/" },
  { company: "NVIDIA", kind: "official", url: "https://blogs.nvidia.com/feed/" },
  { company: "Apple", kind: "official", url: "https://machinelearning.apple.com/rss.xml" },
  { company: "Netflix", kind: "official", url: "https://netflixtechblog.com/feed" },
  { company: "GitHub", kind: "official", url: "https://github.blog/feed/" },
  { company: "Spring", kind: "official", url: "https://spring.io/blog.atom" },
  { company: "InfoQ", kind: "community", url: "https://feed.infoq.com/" },
  { company: "Hacker News", kind: "community", url: "https://hnrss.org/frontpage?points=150" },
  { company: "Hiring", kind: "press", url: gnews("hiring software engineers India tech companies"), max: 15 },
];

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const strip = (html: string) =>
  decode(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const attr = (xml: string, re: RegExp) => xml.match(re)?.[1];

function parse(xml: string, f: Feed): Post[] {
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  const out: Post[] = [];
  for (const b of blocks.slice(0, f.max ?? 20)) {
    let title = strip(tag(b, "title"));
    let url = atom ? (attr(b, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) ?? attr(b, /<link[^>]*href="([^"]+)"/i) ?? "") : decode(tag(b, "link")).trim();
    if (!url) url = decode(tag(b, "guid")).trim();
    const raw = tag(b, "content:encoded") || tag(b, "description") || tag(b, "summary") || tag(b, "content");
    let source = f.company;
    // Google News: "Headline - Publisher" with a <source> tag; its description just repeats the headline
    const pub = strip(tag(b, "source"));
    if (pub) {
      source = pub;
      title = title.replace(new RegExp(`\\s+-\\s+${pub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
    }
    const summary = pub ? "" : strip(raw).slice(0, 320);
    const image =
      attr(b, /<media:content[^>]*url="([^"]+)"[^>]*(?:medium="image"|type="image)/i) ??
      attr(b, /<media:thumbnail[^>]*url="([^"]+)"/i) ??
      attr(b, /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) ??
      attr(decode(raw), /<img[^>]*src="(https:[^"]+)"/i);
    const at = new Date(strip(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")) || Date.now());
    if (!title || !/^https?:/.test(url)) continue;
    out.push({
      id: `${f.company}:${url}`.slice(0, 300),
      company: f.company,
      kind: f.kind,
      title,
      url,
      summary,
      image: image?.startsWith("https:") ? decode(image) : undefined,
      source,
      at: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
    });
  }
  return out;
}

async function fetchFeed(f: Feed): Promise<Post[]> {
  try {
    const r = await fetch(f.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!r.ok) return [];
    return parse(await r.text(), f);
  } catch {
    return [];
  }
}

type Cache = { at: number; posts: Post[]; failed: string[] };
let cache: Cache | null = null;
let loading: Promise<Cache> | null = null;

async function load(): Promise<Cache> {
  const results = await Promise.all(FEEDS.map(async (f) => ({ f, posts: await fetchFeed(f) })));
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const { posts: ps } of results)
    for (const p of ps) {
      const k = p.title.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 80);
      if (seen.has(k)) continue;
      seen.add(k);
      posts.push(p);
    }
  posts.sort((a, b) => b.at.localeCompare(a.at));
  const failed = [...new Set(results.filter((r) => !r.posts.length).map((r) => r.f.company))];
  const c: Cache = { at: Date.now(), posts, failed };
  cache = c;
  return c;
}

export async function news(force = false): Promise<Cache> {
  const fresh = cache && Date.now() - cache.at < 30 * 60_000;
  if (cache && fresh && !force) return cache;
  loading ??= load().finally(() => (loading = null));
  if (cache && !force) return cache; // stale-while-revalidate
  return loading;
}
