import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

/**
 * Where the hub's personal state lives, fail-proof:
 *   1) a private Vercel Blob store (shared by the live site, the phone, the Mac and the JARVIS daemon)
 *   2) .data/hub.json on this machine (local fallback, and a mirror so nothing is lost if the cloud is down)
 */
const KEY = "hub/state.json";
const FILE = path.join(process.cwd(), ".data", "hub.json");
export const cloudState = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function readState(): Promise<string | null> {
  if (cloudState()) {
    try {
      const r = await get(KEY, { access: "private", useCache: false });
      if (r?.stream) return await new Response(r.stream).text();
      if (r === null) {
        // first use: seed the cloud from the local copy if there is one
        const local = await readFile(FILE, "utf8").catch(() => null);
        return local;
      }
    } catch {}
  }
  return readFile(FILE, "utf8").catch(() => null);
}

export async function writeState(body: string): Promise<boolean> {
  let ok = false;
  if (cloudState()) {
    try {
      await put(KEY, body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
      ok = true;
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, body, { mode: 0o600 });
      ok = true;
    } catch {}
  }
  return ok;
}
