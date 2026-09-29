/** Id and file-naming rules for recordings. Shared by the browser and the API. */

export const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

// Timestamp first so ids sort chronologically; the suffix avoids collisions.
const ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{8}$/;

export function isValidId(id: string) {
  return ID_PATTERN.test(id);
}

export function newRecordingId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${stamp}-${suffix}`;
}

/** Maps "audio/webm;codecs=opus" to "audio/webm", or null if we don't accept it. */
export function baseMimeType(contentType: string | null | undefined) {
  const base = contentType?.split(";")[0].trim().toLowerCase() ?? "";
  return base in EXTENSIONS ? base : null;
}

export function audioFileName(id: string, mimeType: string) {
  return `${id}.${EXTENSIONS[mimeType]}`;
}

/** Storage path of a recording's audio, e.g. "recordings/20260929T081414Z-a40714b0.webm". */
export function audioPathname(file: string) {
  return `recordings/${file}`;
}

const AUDIO_PATHNAME = /^recordings\/(\d{8}T\d{6}Z-[a-f0-9]{8})\.(webm|m4a|ogg)$/;

export function parseAudioPathname(pathname: string) {
  const match = AUDIO_PATHNAME.exec(pathname);
  return match ? { id: match[1], file: pathname.slice("recordings/".length) } : null;
}

export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
