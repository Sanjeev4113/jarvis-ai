/**
 * Free language models, tried in order, all through the OpenAI-compatible chat API:
 *   Groq (GROQ_API_KEY, free tier) → Gemini (GEMINI_API_KEY, free tier) → OpenRouter (OPENROUTER_API_KEY, ":free" models)
 *   → Pollinations (no key at all).
 * If one fails or hits its free limit before sending any text, the next one takes over.
 *   + Ollama on Sanjeev's own Mac when it is running (free forever, no key, private; used for private data too).
 * Server-only (keys never reach the browser). Used by San-AI, AI-CIAN, JobAI and JARVIS when Claude isn't available.
 */

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type FnTool = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { name: string; args: string };
type Provider = { id: string; label: string; url: string; key?: string; model: string; maxContext: number; private?: boolean };

/* ---------- Ollama: a model running on Sanjeev's own Mac. Free forever, no key, nothing leaves the machine. ---------- */

const OLLAMA = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
let ollamaSeen: { at: number; up: boolean } = { at: 0, up: false };
/** Cheap reachability check (cached 60 s) so the chain only includes Ollama when it is actually running. */
export async function ollamaUp() {
  if (process.env.OLLAMA_DISABLED === "1") return false;
  if (Date.now() - ollamaSeen.at < 60_000) return ollamaSeen.up;
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(800) });
    const j = (await r.json()) as { models?: { name: string }[] };
    ollamaSeen = { at: Date.now(), up: r.ok && !!j.models?.length };
  } catch {
    ollamaSeen = { at: Date.now(), up: false };
  }
  return ollamaSeen.up;
}
const ollama: Provider = { id: "ollama", label: "Ollama · on your Mac", url: `${OLLAMA}/v1/chat/completions`, model: process.env.OLLAMA_MODEL ?? "jarvis", maxContext: Number(process.env.OLLAMA_CONTEXT ?? 16_000), private: true };

export function providers(task: "chat" | "long" = "chat", sensitive = false): Provider[] {
  const list: Provider[] = [];
  const groq: Provider | null = process.env.GROQ_API_KEY
    ? { id: "groq", label: "Groq · Llama", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", maxContext: 30_000 }
    : null;
  const gemini: Provider | null = process.env.GEMINI_API_KEY
    ? { id: "gemini", label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash", maxContext: 900_000 }
    : null;
  const openrouter: Provider | null = process.env.OPENROUTER_API_KEY
    ? { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free", maxContext: 120_000 }
    : null;
  const pollinations: Provider = { id: "pollinations", label: "Pollinations (free)", url: "https://text.pollinations.ai/openai", model: process.env.POLLINATIONS_MODEL ?? "openai", maxContext: 60_000 };
  // long jobs (resume tailoring) prefer the biggest context first; the local model is the free-forever fallback
  const local = ollamaSeen.up ? ollama : null;
  const order = task === "long" ? [gemini, openrouter, groq, local] : [groq, gemini, local, openrouter];
  for (const p of order) if (p) list.push(p);
  // Pollinations is anonymous: never send it private data (resume with phone number, emails, documents)
  if (!sensitive && process.env.FREE_LLM_NO_POLLINATIONS !== "1") list.push(pollinations);
  return list;
}

/* ---------- Claude health: remember when it's out of credit so we don't waste a call every time ---------- */

let claudeDownUntil = 0;
export const claudeUsable = () => !!process.env.ANTHROPIC_API_KEY && Date.now() > claudeDownUntil;
export function claudeFailed(err: unknown) {
  const e = err as { status?: number; message?: string };
  const msg = e.message ?? "";
  // no credit, bad key, overloaded: skip Claude for a while and use the free chain
  if (/credit balance|billing|authentication|invalid x-api-key|permission/i.test(msg) || e.status === 401 || e.status === 402 || e.status === 403) claudeDownUntil = Date.now() + 30 * 60_000;
  else claudeDownUntil = Date.now() + 2 * 60_000;
}

/** One tiny request (cached 30 min) to learn whether Claude can actually answer (key present and in credit). */
let probe: { at: number; ok: boolean } | null = null;
export async function claudeReady() {
  if (!process.env.ANTHROPIC_API_KEY || !claudeUsable()) return false;
  if (probe && Date.now() - probe.at < 30 * 60_000) return probe.ok;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    await new Anthropic().messages.create({ model: "claude-haiku-5-5", max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    probe = { at: Date.now(), ok: true };
  } catch (e) {
    claudeFailed(e);
    probe = { at: Date.now(), ok: false };
  }
  return probe.ok;
}

const approxTokens = (msgs: Msg[]) => Math.ceil(msgs.reduce((n, m) => n + m.content.length, 0) / 3.6);

/**
 * Stream a chat completion. Calls onText for each text delta; returns any tool calls and which provider answered.
 * Throws only if every provider failed.
 */
export async function streamChat(opts: {
  messages: Msg[];
  tools?: FnTool[];
  maxTokens?: number;
  temperature?: number;
  task?: "chat" | "long";
  /** Contains private data: only providers behind the owner's own free account (Groq, Gemini, OpenRouter) or Ollama. */
  sensitive?: boolean;
  /** Ask for a JSON object (response_format), where the provider supports it. */
  json?: boolean;
  /** Try this provider first (by id: ollama, gemini, groq, openrouter, pollinations); the rest stay as fallbacks. */
  prefer?: string;
  signal?: AbortSignal;
  onText?: (t: string) => void;
}): Promise<{ provider: string; text: string; toolCalls: ToolCall[] }> {
  const errors: string[] = [];
  await ollamaUp();
  const all = providers(opts.task, opts.sensitive);
  const list = opts.prefer ? [...all.filter((p) => p.id === opts.prefer), ...all.filter((p) => p.id !== opts.prefer)] : all;
  if (!list.length) throw new Error("This needs a free GEMINI_API_KEY or GROQ_API_KEY (private data is never sent to the anonymous provider).");
  for (const p of list) {
    if (approxTokens(opts.messages) + (opts.maxTokens ?? 1000) > p.maxContext) continue;
    let sent = false;
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}), ...(p.id === "openrouter" ? { "X-Title": "Sanjeev Portfolio" } : {}) },
        body: JSON.stringify({
          model: p.model,
          messages: opts.messages,
          stream: true,
          max_tokens: opts.maxTokens ?? 1000,
          temperature: opts.temperature ?? 0.5,
          ...(opts.tools?.length ? { tools: opts.tools.map((t) => ({ type: "function", function: t })), tool_choice: "auto" } : {}),
          // local reasoning models: skip the slow hidden "thinking" pass
          ...(p.id === "ollama" ? { reasoning_effort: "none" } : {}),
          ...(opts.json && p.id !== "pollinations" ? { response_format: { type: "json_object" } } : {}),
        }),
        // long jobs (resume tailoring on the local model) get 5 minutes; chat gets 90 s before the next provider
        signal: opts.signal ?? AbortSignal.timeout(opts.task === "long" ? 300_000 : 90_000),
      });
      if (!res.ok || !res.body) throw new Error(`${p.id} ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let text = "";
      let thinking = false; // reasoning models (qwen3, deepseek-r1) may stream <think>…</think> first: hide it
      const calls: { name: string; args: string }[] = [];
      // the anonymous model is a reasoning model that sometimes spills its private reasoning into the answer
      // ("…requirements.User is ready. We need to ask…"): pass text on sentence by sentence and stop at a leak
      const guard = p.id === "pollinations" && !opts.json ? leakGuard() : null;
      const emit = (piece: string) => {
        const out = guard ? guard.push(piece) : piece;
        if (!out) return;
        text += out;
        sent = true;
        opts.onText?.(out);
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let j: { choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[] } }[]; error?: { message?: string } };
          try {
            j = JSON.parse(data);
          } catch {
            continue;
          }
          if (j.error) throw new Error(`${p.id}: ${j.error.message}`);
          const d = j.choices?.[0]?.delta;
          let piece = d?.content ?? "";
          if (piece.includes("<think>")) {
            thinking = true;
            piece = piece.split("<think>")[0];
          }
          if (thinking) {
            const end = (d?.content ?? "").indexOf("</think>");
            if (end < 0) piece = "";
            else {
              thinking = false;
              piece = (d?.content ?? "").slice(end + 8).replace(/^\s+/, "");
            }
          }
          if (piece && !(text === "" && !piece.trim())) emit(piece);
          for (const tc of d?.tool_calls ?? []) {
            const i = tc.index ?? calls.length;
            calls[i] ??= { name: "", args: "" };
            if (tc.function?.name) calls[i].name += tc.function.name;
            if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          }
        }
      }
      if (guard) emit(guard.end());
      if (!text && !calls.length) throw new Error(`${p.id}: empty answer`);
      return { provider: p.label, text, toolCalls: calls.filter((c) => c.name) };
    } catch (e) {
      if ((e as Error).name === "AbortError" && opts.signal?.aborted) throw e;
      if (sent) throw e; // text already streamed: don't restart with a different model
      errors.push((e as Error).message);
    }
  }
  throw new Error(`All free models failed: ${errors.join(" | ").slice(0, 600)}`);
}

/** Ask for JSON matching a JSON Schema; parse and validate with `parse` (e.g. a Zod schema's safeParse). Retries once. */
export async function chatJson<T>(opts: { system: string; user: string; schema: object; parse: (x: unknown) => { success: true; data: T } | { success: false; error: { message: string } }; maxTokens?: number; task?: "chat" | "long"; sensitive?: boolean }): Promise<T> {
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await streamChat({
      task: opts.task,
      sensitive: opts.sensitive,
      json: true,
      maxTokens: opts.maxTokens ?? 4000,
      temperature: 0.2,
      messages: [
        { role: "system", content: `${opts.system}\n\nReply with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(opts.schema)}` },
        { role: "user", content: opts.user + feedback },
      ],
    });
    const raw = text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}");
    try {
      const r = opts.parse(JSON.parse(raw));
      if (r.success) return r.data;
      feedback = `\n\nYour previous reply did not match the schema (${r.error.message.slice(0, 300)}). Reply again with valid JSON only.`;
    } catch {
      feedback = "\n\nYour previous reply was not valid JSON. Reply again with a single JSON object only.";
    }
  }
  throw new Error("The free model did not return valid JSON.");
}

/** Leaked reasoning looks like notes to itself, not words to the user. */
const LEAK = /^(?:assistantfinal|analysis\b|(?:the )?user (?:is|was|wants|asked|says|said|seems|has|just|might|may)\b|we (?:need|should|must|have) to\b|i (?:need|should|must) to (?:ask|respond|answer|reply|say|produce|craft)\b|let's (?:respond|answer|reply|craft|produce|formulate)\b|our (?:response|reply|answer) (?:should|must|will)\b|(?:the )?(?:assistant|system) (?:should|must|needs)\b)/i;
/** Buffers a stream into sentences; drops everything from the first leaked-reasoning sentence onward. */
export function leakGuard() {
  let buf = "";
  let raw = ""; // everything so far, to spot the "assistantfinal" marker even inside dropped reasoning
  let finalSeen = false;
  let stopped = false;
  const clean = (sentence: string) => {
    if (stopped) return "";
    if (LEAK.test(sentence.trim())) {
      stopped = true;
      return "";
    }
    return sentence;
  };
  return {
    push(piece: string) {
      if (!finalSeen) {
        raw += piece;
        // "assistantfinal" marks where a reasoning model's real answer starts: drop all before it and resume
        const fin = raw.search(/assistantfinal/i);
        if (fin >= 0) {
          finalSeen = true;
          stopped = false;
          buf = raw.slice(fin + "assistantfinal".length).replace(/^\s+/, "");
          raw = "";
          piece = "";
        } else if (raw.length > 20000) raw = raw.slice(-200);
      }
      buf += piece;
      let out = "";
      for (;;) {
        // a sentence ends at . ! ? … followed by space, a newline, or straight into a capital ("requirements.User")
        const m = buf.match(/^[\s\S]*?[.!?…](?:\s+|(?=[A-Z]))/);
        if (!m || m[0].length >= buf.length + 1) break;
        out += clean(m[0]);
        buf = buf.slice(m[0].length);
        if (stopped) break;
      }
      return out;
    },
    end() {
      const rest = clean(buf);
      buf = "";
      return rest;
    },
  };
}
