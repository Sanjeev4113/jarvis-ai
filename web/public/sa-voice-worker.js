// Sa's neural voice: Kokoro-82M (Apache-2.0) running in this worker, fully in the browser, free.
// The model (~90 MB) downloads once from Hugging Face and is cached by the browser.
// Messages in:  {type:"load"} | {type:"speak", id, text, voice, speed} | {type:"cancel"}
// Messages out: {type:"progress", progress} | {type:"ready", device} | {type:"audio", id, audio, rate} | {type:"error", id?, message}

const LIB = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

let tts = null;
let loading = null;
const files = new Map();

let device = "wasm";
function load(opts = {}) {
  loading ??= (async () => {
    const { KokoroTTS } = await import(LIB);
    device = opts.device === "webgpu" && self.navigator?.gpu && (await self.navigator.gpu.requestAdapter().catch(() => null)) ? "webgpu" : "wasm";
    tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: opts.dtype ?? (device === "webgpu" ? "fp32" : "q8"),
      device,
      progress_callback: (p) => {
        if (p.status !== "progress" || !p.total) return;
        files.set(p.file, [p.loaded, p.total]);
        let loaded = 0;
        let total = 0;
        for (const [l, t] of files.values()) {
          loaded += l;
          total += t;
        }
        postMessage({ type: "progress", progress: total ? loaded / total : 0 });
      },
    });
    postMessage({ type: "ready", device });
  })().catch((e) => {
    loading = null;
    postMessage({ type: "error", message: String(e?.message ?? e) });
    throw e;
  });
  return loading;
}

let epoch = 0;
const queue = [];
let busy = false;

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    if (job.epoch !== epoch) continue;
    try {
      await load();
      const out = await tts.generate(job.text, { voice: job.voice || "am_michael", speed: job.speed || 1 });
      if (job.epoch !== epoch) continue;
      const audio = out.audio;
      postMessage({ type: "audio", id: job.id, audio, rate: out.sampling_rate }, [audio.buffer]);
    } catch (e) {
      postMessage({ type: "error", id: job.id, message: String(e?.message ?? e) });
    }
  }
  busy = false;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") load(m).catch(() => {});
  else if (m.type === "speak") {
    queue.push({ ...m, epoch });
    void pump();
  } else if (m.type === "cancel") {
    epoch++;
    queue.length = 0;
  }
};
