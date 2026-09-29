import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { EXTENSIONS, MAX_AUDIO_BYTES, parseAudioPathname } from "@/lib/recording-ids";
import { storageMode } from "@/lib/storage";

/**
 * Issues short-lived tokens so the browser can upload audio straight to
 * Vercel Blob. That skips the 4.5 MB limit on function request bodies.
 */
export async function POST(request: Request) {
  if (storageMode !== "blob") return new Response("Blob storage isn't configured", { status: 501 });

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!parseAudioPathname(pathname)) throw new Error("Invalid recording path");
        return {
          allowedContentTypes: Object.keys(EXTENSIONS),
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      // The browser registers the take itself once upload() resolves, which
      // also works in local dev where Blob can't call back to localhost.
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
