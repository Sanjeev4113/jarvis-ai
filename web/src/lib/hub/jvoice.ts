"use client";

/**
 * JARVIS's voice and ears, every layer free and with a fallback:
 *   Speak:  1) Kokoro neural voice on the GPU (British male "bm_george", on-device)  2) the browser's own voice
 *   Listen: 1) the browser's speech recognition (Chrome, Edge, Safari)  2) Whisper on-device (any browser)  3) typing
 * `levels` (0..1) drive the talk-mode orb.
 */

export const levels = { mic: 0, out: 0 };
export type VoiceEngine = "neural" | "browser";
export type EarEngine = "browser" | "whisper" | "none";

/* ======================= speaking ======================= */

let ctx: AudioContext | null = null;
let outAnalyser: AnalyserNode | null = null;
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 512;
    outAnalyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

let worker: Worker | null = null;
let neural: "off" | "loading" | "ready" | "failed" = "off";
const VOICE = "bm_george";
let nextId = 1;
let nextPlay = 1;
const arrived = new Map<number, Float32Array | null>();
let playHead = 0;
let live = 0; // clips scheduled and not finished
let buffered = "";
let speakingNow = false;
const doneWaiters: (() => void)[] = [];
let sources: AudioBufferSourceNode[] = [];
let browserUtter = 0;

export const voiceEngine = (): VoiceEngine => (neural === "ready" ? "neural" : "browser");
export const neuralState = () => neural;

/** Start loading the neural voice in the background (only on GPUs, where it runs faster than real time). */
export function warmVoice() {
  if (worker || neural === "failed" || typeof Worker === "undefined") return;
  if (!("gpu" in navigator)) {
    neural = "failed";
    return;
  }
  neural = "loading";
  const w = new Worker("/sa-voice-worker.js", { type: "module" });
  worker = w;
  const fail = () => {
    w.terminate();
    worker = null;
    neural = "failed";
  };
  w.onerror = fail;
  w.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id?: number; device?: string; audio?: Float32Array; rate?: number };
    if (m.type === "ready") {
      if (m.device !== "webgpu") return fail();
      w.postMessage({ type: "speak", id: 0, text: "Online.", voice: VOICE });
    } else if (m.type === "audio") {
      if (m.id === 0) neural = "ready";
      else onAudio(m.id!, m.audio!, m.rate!);
    } else if (m.type === "error") {
      if (!m.id) fail();
      else onAudio(m.id, null, 24000);
    }
  };
  w.postMessage({ type: "load", device: "webgpu" });
}

function setSpeaking(v: boolean) {
  speakingNow = v;
  if (!v) while (doneWaiters.length) doneWaiters.shift()!();
}
export const isSpeaking = () => speakingNow;
/** Resolves when everything queued so far has been spoken. */
export const spoken = () => (speakingNow ? new Promise<void>((r) => doneWaiters.push(r)) : Promise.resolve());

function onAudio(id: number, pcm: Float32Array | null, rate: number) {
  if (id < nextPlay) return;
  arrived.set(id, pcm);
  while (arrived.has(nextPlay)) {
    const a = arrived.get(nextPlay)!;
    arrived.delete(nextPlay);
    nextPlay++;
    if (a && a.length) schedule(a, rate);
  }
  if (nextPlay === nextId && live === 0) setSpeaking(false);
}

function schedule(pcm: Float32Array, rate: number) {
  const c = audio();
  const buf = c.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(new Float32Array(pcm), 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(outAnalyser!);
  const start = Math.max(c.currentTime + 0.03, playHead);
  src.start(start);
  playHead = start + buf.duration + 0.12;
  live++;
  sources.push(src);
  src.onended = () => {
    live--;
    sources = sources.filter((x) => x !== src);
    if (live === 0 && nextPlay === nextId) setSpeaking(false);
  };
}

/** Clean text for speech: no markdown, no code, short links. */
function speakable(t: string) {
  return t
    .replace(/```[\s\S]*?```/g, " I've put the code on screen. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/[*_#>|]/g, "")
    .replace(/\bO\((.+?)\)/g, "O of $1")
    .replace(/\bDSA\b/g, "D S A")
    .replace(/\bJARVIS\b/gi, "Jarvis")
    .replace(/\s+/g, " ")
    .trim();
}

function sayPhrase(text: string) {
  const t = speakable(text);
  if (!t) return;
  setSpeaking(true);
  if (neural === "ready" && worker) {
    audio();
    worker.postMessage({ type: "speak", id: nextId++, text: t, voice: VOICE, speed: 1.0 });
    return;
  }
  // fallback: the browser's voice, preferring a British male one
  if (typeof speechSynthesis === "undefined") return setSpeaking(false);
  const u = new SpeechSynthesisUtterance(t);
  const vs = speechSynthesis.getVoices();
  u.voice = vs.find((v) => /Daniel|Arthur|Oliver|Google UK English Male/i.test(v.name)) ?? vs.find((v) => /en-GB/i.test(v.lang)) ?? vs.find((v) => /^en/i.test(v.lang)) ?? null;
  u.rate = 1.03;
  u.pitch = 0.92;
  browserUtter++;
  const done = () => {
    browserUtter--;
    if (browserUtter <= 0) {
      browserUtter = 0;
      setSpeaking(false);
    }
  };
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
}

/** Stream text in as it arrives; whole sentences are spoken as soon as they're complete. */
export function feed(delta: string) {
  buffered += delta;
  for (;;) {
    const m = buffered.match(/^([\s\S]*?[.!?…:;])(\s+|\n)/) ?? (buffered.length > 220 ? buffered.match(/^([\s\S]{120,220}?[,)])\s/) : null);
    if (!m) break;
    sayPhrase(m[1]);
    buffered = buffered.slice(m[0].length);
  }
  // never speak code blocks piece by piece
  if (/```/.test(buffered) && (buffered.match(/```/g) ?? []).length % 2 === 1) return;
}
export function flush() {
  if (buffered.trim()) sayPhrase(buffered);
  buffered = "";
}
export function say(text: string) {
  feed(text + " ");
  flush();
}
export function stopSpeaking() {
  buffered = "";
  worker?.postMessage({ type: "cancel" });
  nextPlay = nextId;
  arrived.clear();
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources = [];
  live = 0;
  playHead = 0;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  browserUtter = 0;
  setSpeaking(false);
}

/* ======================= listening ======================= */

type SRResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SR = { start: () => void; stop: () => void; abort: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { results: ArrayLike<SRResult>; resultIndex: number }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; onspeechstart?: (() => void) | null };

export function earEngine(): EarEngine {
  if (typeof window === "undefined") return "none";
  const W = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  if (W.SpeechRecognition || W.webkitSpeechRecognition) return "browser";
  if (typeof Worker !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") return "whisper";
  return "none";
}

let micStream: MediaStream | null = null;
let micAnalyser: AnalyserNode | null = null;
let micRaf = 0;
async function micMeter() {
  if (micStream) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const c = audio();
    micAnalyser = c.createAnalyser();
    micAnalyser.fftSize = 1024;
    c.createMediaStreamSource(micStream).connect(micAnalyser);
  } catch {
    micStream = null;
  }
}

/** Update the mic/output levels each frame (call while talk mode is open). */
export function startMeters() {
  const a = new Uint8Array(512);
  const tick = () => {
    if (micAnalyser) {
      micAnalyser.getByteTimeDomainData(a);
      let s = 0;
      for (let i = 0; i < a.length; i++) s += ((a[i] - 128) / 128) ** 2;
      levels.mic = Math.min(1, Math.sqrt(s / a.length) * 4.5);
    }
    if (outAnalyser) {
      const b = new Uint8Array(256);
      outAnalyser.getByteTimeDomainData(b);
      let s = 0;
      for (let i = 0; i < b.length; i++) s += ((b[i] - 128) / 128) ** 2;
      levels.out = Math.min(1, Math.sqrt(s / b.length) * 5);
    }
    if (browserUtter > 0) levels.out = 0.35 + 0.25 * Math.sin(performance.now() / 90) * Math.sin(performance.now() / 37);
    micRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(micRaf);
  micRaf = requestAnimationFrame(tick);
}
export function stopMeters() {
  cancelAnimationFrame(micRaf);
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  micAnalyser = null;
  levels.mic = 0;
  levels.out = 0;
}

/* ---- Whisper fallback: record until ~1 s of silence, then transcribe on-device ---- */
let stt: Worker | null = null;
let sttId = 1;
const sttWaiters = new Map<number, (t: string) => void>();
export let whisperProgress = 0;
function whisper() {
  if (stt) return stt;
  stt = new Worker("/jarvis-stt-worker.js", { type: "module" });
  stt.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id?: number; text?: string; progress?: number };
    if (m.type === "progress") whisperProgress = m.progress ?? 0;
    if (m.type === "ready") whisperProgress = 1;
    if ((m.type === "text" || m.type === "error") && m.id) {
      sttWaiters.get(m.id)?.(m.text ?? "");
      sttWaiters.delete(m.id);
    }
  };
  stt.postMessage({ type: "load" });
  return stt;
}

async function recordUtterance(signal: { stop: boolean }, onInterim: (t: string) => void): Promise<string> {
  await micMeter();
  if (!micStream) return "";
  const c = audio();
  const src = c.createMediaStreamSource(micStream);
  const proc = c.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let heard = false;
  let silentFor = 0;
  const started = performance.now();
  await new Promise<void>((resolve) => {
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length);
      const dt = d.length / c.sampleRate;
      if (rms > 0.02) {
        heard = true;
        silentFor = 0;
        onInterim("…");
      } else silentFor += dt;
      if (heard) chunks.push(new Float32Array(d));
      if (signal.stop || (heard && silentFor > 1.0) || performance.now() - started > 20_000) {
        proc.disconnect();
        src.disconnect();
        resolve();
      }
    };
    src.connect(proc);
    proc.connect(c.destination);
  });
  if (!heard || !chunks.length) return "";
  // downsample to 16 kHz mono for Whisper
  const total = chunks.reduce((n, x) => n + x.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const ch of chunks) {
    all.set(ch, o);
    o += ch.length;
  }
  const ratio = c.sampleRate / 16000;
  const out = new Float32Array(Math.floor(all.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = all[Math.floor(i * ratio)];
  const id = sttId++;
  const w = whisper();
  return new Promise((resolve) => {
    sttWaiters.set(id, resolve);
    w.postMessage({ type: "transcribe", id, audio: out }, [out.buffer]);
  });
}

let active: { stop: () => void } | null = null;

/**
 * Listen for one utterance and resolve with the final text ("" if nothing was said).
 * `onInterim` receives live partial text for the subtitle.
 */
export function listenOnce(onInterim: (t: string) => void): Promise<string> {
  active?.stop();
  void micMeter();
  const engine = earEngine();
  if (engine === "browser") {
    return new Promise((resolve) => {
      const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
      const r = new (W.SpeechRecognition ?? W.webkitSpeechRecognition)!();
      r.lang = "en-IN";
      r.interimResults = true;
      r.continuous = false;
      let final = "";
      let settled = false;
      const finish = (t: string) => {
        if (settled) return;
        settled = true;
        active = null;
        resolve(t.trim());
      };
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        onInterim((final + interim).trim());
      };
      r.onend = () => finish(final);
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          // blocked: fall through to on-device Whisper
          settled = true;
          active = null;
          void (async () => resolve(await recordUtterance({ stop: false }, onInterim)))();
        }
      };
      active = { stop: () => r.stop() };
      try {
        r.start();
      } catch {
        finish("");
      }
    });
  }
  if (engine === "whisper") {
    const sig = { stop: false };
    active = { stop: () => (sig.stop = true) };
    return recordUtterance(sig, onInterim).finally(() => (active = null));
  }
  return Promise.resolve("");
}
export function stopListening() {
  active?.stop();
  active = null;
}
