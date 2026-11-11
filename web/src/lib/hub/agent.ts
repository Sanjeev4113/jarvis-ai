"use client";

import { local, setLocal } from "./store";

/** Talks to the JARVIS agent running on Sanjeev's Mac (127.0.0.1). The pairing token stays on this device only. */

export type AgentConfig = { url: string; token: string };
export type AgentStatus = { ok: true; host: string; version: string; folders: string[]; trusted: boolean };

const KEY = "jarvis-agent";
export const agentConfig = () => local<AgentConfig | null>(KEY, null);
export const saveAgent = (c: AgentConfig | null) => setLocal(KEY, c);

export async function agentStatus(c = agentConfig()): Promise<AgentStatus | null> {
  if (!c) return null;
  try {
    const r = await fetch(`${c.url}/status`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(2500) });
    return r.ok ? ((await r.json()) as AgentStatus) : null;
  } catch {
    return null;
  }
}

export async function agentAct(action: string, args: Record<string, unknown>, reason: string): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const c = agentConfig();
  if (!c) return { ok: false, error: "The Mac agent isn't paired yet." };
  try {
    const r = await fetch(`${c.url}/act`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, args, reason }),
      signal: AbortSignal.timeout(130_000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: Record<string, unknown>; error?: string };
    return r.ok ? { ok: true, result: j.result } : { ok: false, error: j.error ?? `Agent error ${r.status}` };
  } catch {
    return { ok: false, error: "Couldn't reach the Mac agent. Is `node jarvis/agent.mjs` running?" };
  }
}
