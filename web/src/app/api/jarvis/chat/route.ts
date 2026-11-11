import { z } from "zod";
import { currentOwner } from "@/lib/vault/auth";
import { ollamaUp, providers, streamChat } from "@/lib/llm/free";
import { SYSTEM, TOOLS, contextText } from "@/lib/hub/jarvisBrain";
import { PRIVATE_MARK } from "@/lib/hub/shared";

export const maxDuration = 120;

/**
 * JARVIS: Sanjeev's personal agent (owner only). Streams NDJSON events:
 *   {type:"text", delta} · {type:"tool", name, args} · {type:"done", provider, privateMode} · {type:"error", message}
 * Tools never run here. The browser runs safe ones (add a task, open a tab) and turns anything that sends,
 * overwrites or touches the computer into an approval card that Sanjeev must accept first.
 *
 * Privacy: personal context (tasks, timetable, documents, screen) is only sent to a provider behind his own free
 * account (Groq/Gemini/OpenRouter). Without one, JARVIS runs in public mode on the anonymous model with no personal context.
 */

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(60_000) });
const Body = z.object({
  messages: z.array(Msg).min(1).max(40),
  context: z
    .object({
      now: z.string().max(60),
      tz: z.string().max(60).optional(),
      workHours: z.string().max(40).optional(),
      dsaDay: z.number().int().min(1).max(60).optional(),
      tasks: z.array(z.string().max(300)).max(60).optional(),
      timetable: z.array(z.string().max(200)).max(40).optional(),
      reminders: z.array(z.string().max(200)).max(30).optional(),
      jobs: z.string().max(2000).optional(),
      agent: z.boolean().optional(),
      tab: z.string().max(30).optional(),
    })
    .partial({ now: true }),
});

export async function POST(req: Request) {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { messages, context: c = {} } = parsed.data;

  await ollamaUp();
  const privateMode = providers("chat", true).length > 0;
  // public mode: drop anything marked private (document text, screen contents) before it can leave
  const history = messages
    .filter((m) => privateMode || !m.content.includes(PRIVATE_MARK))
    .map((m) => ({ role: m.role, content: m.content.replaceAll(PRIVATE_MARK, "").slice(0, privateMode ? 60_000 : 8_000) }));
  if (!history.length || history[history.length - 1].role !== "user") return Response.json({ error: "Nothing to answer." }, { status: 400 });

  const ctx = contextText(c, privateMode);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: object) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        // Agent loop: tools run in the browser (safe ones at once, major ones after approval), so each round's calls
        // are reported back as "queued" and the model gets up to 3 rounds to finish multi-step requests.
        const convo = [{ role: "system" as const, content: `${SYSTEM}\n\nCONTEXT\n${ctx}` }, ...history];
        let provider = "";
        for (let round = 0; round < 3; round++) {
          const r = await streamChat({
            messages: convo,
            tools: TOOLS,
            maxTokens: 1500,
            temperature: 0.4,
            sensitive: privateMode,
            signal: req.signal,
            onText: (t) => send({ type: "text", delta: t }),
          });
          provider = r.provider;
          if (!r.toolCalls.length) break;
          const calls: string[] = [];
          for (const tc of r.toolCalls) {
            let args: unknown = {};
            try {
              args = JSON.parse(tc.args || "{}");
            } catch {}
            send({ type: "tool", name: tc.name, args });
            calls.push(`${tc.name}(${JSON.stringify(args).slice(0, 400)})`);
          }
          if (r.text) send({ type: "text", delta: "\n\n" });
          convo.push(
            { role: "assistant", content: `${r.text}\n[called: ${calls.join("; ")}]`.trim() },
            {
              role: "user",
              content: "[system] Those tool calls are done or waiting for Sanjeev's approval (approval cards are shown to him). If any part of his request still needs a tool, call it now. Otherwise reply with one short line confirming what was set up; do not repeat calls you already made.",
            },
          );
        }
        send({ type: "done", provider, privateMode });
      } catch (e) {
        if ((e as Error).name !== "AbortError") send({ type: "error", message: (e as Error).message.slice(0, 300) });
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!(await currentOwner())) return Response.json({ error: "unauthorised" }, { status: 401 });
  await ollamaUp();
  return Response.json({ privateMode: providers("chat", true).length > 0, brains: providers("chat", true).map((p) => p.label), mail: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) });
}
