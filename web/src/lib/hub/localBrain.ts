"use client";

import { SYSTEM, TOOLS, contextText, type JarvisContext } from "./jarvisBrain";

/**
 * JARVIS's private brain when the website runs in the cloud: the browser talks straight to Ollama on this Mac
 * (127.0.0.1), so tasks, mail and documents never leave the machine. Used when the server has no private model.
 */
const OLLAMA = "http://127.0.0.1:11434";
let seen: { at: number; ok: boolean } = { at: 0, ok: false };

/** Phones and tablets can't reach the Mac's 127.0.0.1, so don't probe there (it would only trigger a permission prompt). */
const handheld = () => typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));

export async function localBrainUp() {
  if (handheld()) return false;
  if (Date.now() - seen.at < 60_000) return seen.ok;
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = (await r.json()) as { models?: { name: string }[] };
    seen = { at: Date.now(), ok: r.ok && !!j.models?.some((m) => m.name.startsWith("jarvis") || m.name.startsWith("qwen")) };
  } catch {
    seen = { at: Date.now(), ok: false };
  }
  return seen.ok;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function round(messages: Msg[], onText: (t: string) => void, signal?: AbortSignal) {
  const r = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jarvis", messages, stream: true, max_tokens: 1500, temperature: 0.4, reasoning_effort: "none", tools: TOOLS.map((t) => ({ type: "function", function: t })), tool_choice: "auto" }),
    signal: signal ?? AbortSignal.timeout(180_000),
  });
  if (!r.ok || !r.body) throw new Error(`Ollama ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let thinking = false;
  const calls: { name: string; args: string }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
      let j: { choices?: { delta?: { content?: string; tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[] } }[] };
      try {
        j = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      const d = j.choices?.[0]?.delta;
      let piece = d?.content ?? "";
      if (piece.includes("<think>")) thinking = true;
      if (thinking) {
        const end = piece.indexOf("</think>");
        if (end < 0) piece = "";
        else {
          thinking = false;
          piece = piece.slice(end + 8);
        }
      }
      if (piece && (text || piece.trim())) {
        text += piece;
        onText(piece);
      }
      for (const tc of d?.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        calls[i] ??= { name: "", args: "" };
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
    }
  }
  return { text, calls: calls.filter((c) => c.name) };
}

/** Same agent loop as the server: up to 3 rounds so multi-step requests finish. */
export async function localChat(o: { history: { role: "user" | "assistant"; content: string }[]; context: JarvisContext; onText: (t: string) => void; onTool: (name: string, args: Record<string, unknown>) => void; signal?: AbortSignal }) {
  const convo: Msg[] = [{ role: "system", content: `${SYSTEM}\n\nCONTEXT\n${contextText(o.context, true)}` }, ...o.history.slice(-24)];
  for (let r = 0; r < 3; r++) {
    const { text, calls } = await round(convo, o.onText, o.signal);
    if (!calls.length) break;
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.args || "{}");
      } catch {}
      o.onTool(c.name, args);
    }
    if (text) o.onText("\n\n");
    convo.push({ role: "assistant", content: `${text}\n[called: ${calls.map((c) => `${c.name}(${c.args.slice(0, 300)})`).join("; ")}]`.trim() }, { role: "user", content: "[system] Those tool calls are done or waiting for Sanjeev's approval. If any part of his request still needs a tool, call it now. Otherwise reply with one short line confirming what was set up." });
  }
}

/** One structured answer from the Mac's private model, asked exactly like the server asks it (JSON mode, the schema in
 *  the prompt, no thinking): fast on the local model. Used for resume tailoring. */
export async function localJson(system: string, user: string, schema: object, signal?: AbortSignal): Promise<unknown> {
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${OLLAMA}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jarvis",
        stream: false,
        temperature: 0.2,
        max_tokens: 3500,
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\nReply with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(schema)}` },
          { role: "user", content: user + feedback },
        ],
      }),
      signal: signal ?? AbortSignal.timeout(300_000),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    try {
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      feedback = "\n\nYour previous reply was not valid JSON. Reply again with a single JSON object only.";
    }
  }
  throw new Error("The model didn't return valid JSON.");
}

/** A plain streamed chat with the Mac's private model (interview prep coaching for private skills). */
export async function localStream(system: string, messages: { role: "user" | "assistant"; content: string }[], onText: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jarvis", stream: true, temperature: 0.5, max_tokens: 1800, reasoning_effort: "none", messages: [{ role: "system", content: system }, ...messages] }),
    signal: signal ?? AbortSignal.timeout(300_000),
  });
  if (!r.ok || !r.body) throw new Error(`Ollama ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  let thinking = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      try {
        let d = ((JSON.parse(line.slice(5)) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? "") as string;
        if (d.includes("<think>")) thinking = true;
        if (thinking) {
          if (!d.includes("</think>")) continue;
          d = d.split("</think>").pop() ?? "";
          thinking = false;
        }
        if (d) {
          full += d;
          onText(d);
        }
      } catch {}
    }
  }
  return full;
}
