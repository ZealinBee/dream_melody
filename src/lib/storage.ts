/**
 * Where recordings live.
 *
 * - With BLOB_READ_WRITE_TOKEN set (a Vercel Blob store is connected): private
 *   Vercel Blob storage. Required when deployed — serverless disks are
 *   read-only and wiped between requests.
 * - Otherwise: the local `recordings/` folder, for `npm run dev`.
 *
 * Paths look like "recordings/<id>.json" / "recordings/<id>.webm" in both.
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";

export type StorageMode = "blob" | "local";

export const storageMode: StorageMode = process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";

/** True when we're deployed but nobody has connected a Blob store yet. */
export const storageMissing = storageMode === "local" && !!process.env.VERCEL;

type Store = {
  readJson(pathname: string): Promise<unknown | null>;
  writeJson(pathname: string, value: unknown): Promise<void>;
  /** Pathnames of all .json files under the prefix. */
  listJson(prefix: string): Promise<string[]>;
  /** Size in bytes, or null if the file doesn't exist. */
  size(pathname: string): Promise<number | null>;
  /** Streams audio, honouring a Range header (Safari needs it to play audio). */
  audioResponse(pathname: string, contentType: string, range: string | null): Promise<Response>;
  remove(pathnames: string[]): Promise<void>;
};

// ---------- Local folder ----------

// Scoped to the recordings folder so the build doesn't trace (and ship) the whole project.
const local = (pathname: string) => path.join(process.cwd(), "recordings", pathname.replace(/^recordings\/?/, ""));

async function exists<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const localStore: Store = {
  async readJson(pathname) {
    const text = await exists(() => readFile(local(pathname), "utf8"));
    return text === null ? null : JSON.parse(text);
  },
  async writeJson(pathname, value) {
    await mkdir(path.dirname(local(pathname)), { recursive: true });
    await writeFile(local(pathname), JSON.stringify(value, null, 2));
  },
  async listJson(prefix) {
    const names = (await exists(() => readdir(local(prefix)))) ?? [];
    return names.filter((n) => n.endsWith(".json")).map((n) => `${prefix}${n}`);
  },
  async size(pathname) {
    return (await exists(() => stat(local(pathname))))?.size ?? null;
  },
  async audioResponse(pathname, contentType, range) {
    const data = await exists(() => readFile(local(pathname)));
    if (!data) return new Response("Not found", { status: 404 });
    const headers = { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

    const match = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
    }
    const total = data.length;
    const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  },
  async remove(pathnames) {
    await Promise.all(pathnames.map((p) => rm(local(p), { force: true })));
  },
};

/** Local-only: the browser PUTs audio to our API, which writes it here. */
export async function writeLocalAudio(pathname: string, data: Buffer) {
  await mkdir(path.dirname(local(pathname)), { recursive: true });
  await writeFile(local(pathname), data);
}

// ---------- Vercel Blob ----------

const blobStore: Store = {
  async readJson(pathname) {
    // useCache: false so an edit (instruments, notes) is visible immediately.
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text());
  },
  async writeJson(pathname, value) {
    await put(pathname, JSON.stringify(value), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  },
  async listJson(prefix) {
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      pathnames.push(...page.blobs.map((b) => b.pathname).filter((p) => p.endsWith(".json")));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return pathnames;
  },
  async size(pathname) {
    try {
      return (await head(pathname)).size;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  },
  async audioResponse(pathname, contentType, range) {
    let result;
    try {
      result = await get(pathname, { access: "private", headers: range ? { range } : undefined });
    } catch {
      // Blob answers an unsatisfiable range with 416, which the SDK throws on.
      if (range) return new Response(null, { status: 416 });
      throw new Error(`Couldn't read ${pathname}`);
    }
    if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });

    const headers = new Headers({ "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
    for (const name of ["content-length", "content-range", "etag"]) {
      const value = result.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(result.stream, { status: headers.has("content-range") ? 206 : 200, headers });
  },
  async remove(pathnames) {
    if (pathnames.length > 0) await del(pathnames);
  },
};

export const store: Store = storageMode === "blob" ? blobStore : localStore;
