import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Threshold above which we compress before upload (matches Render's ~100 MB
// request body limit with some headroom for multipart overhead).
export const COMPRESSION_THRESHOLD_BYTES = 80 * 1024 * 1024;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Single-tenant CDN for ffmpeg-core.wasm. Fetched via toBlobURL so the browser
// can execute it under our COOP/COEP-isolated context.
const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export interface CompressOptions {
  onProgress?: (fraction: number) => void; // 0..1
  targetHeight?: number; // default 720
  crf?: number; // 18 (great) .. 32 (small). default 28
}

/**
 * Compress a video file in the browser using ffmpeg.wasm.
 *
 * Returns a new File (mp4, H.264 + AAC) whose filename mirrors the input with
 * a `_compressed` suffix. The instance is cached across calls so subsequent
 * compressions skip the ~30 MB wasm download.
 */
export async function compressVideo(
  file: File,
  { onProgress, targetHeight = 720, crf = 28 }: CompressOptions = {},
): Promise<File> {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "This page isn't cross-origin isolated (SharedArrayBuffer unavailable). Reload the app once so the new headers take effect.",
    );
  }

  const ffmpeg = await loadFFmpeg();

  const inputName = "input" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
  const outputName = "output.mp4";

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      // ffmpeg emits progress as 0..1, but sometimes overshoots slightly.
      onProgress(Math.min(1, Math.max(0, progress)));
    });
  }

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // scale=-2:H keeps width auto and divisible by 2 (required by libx264).
  await ffmpeg.exec([
    "-i", inputName,
    "-vf", `scale=-2:${targetHeight}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  // Copy into a plain ArrayBuffer-backed Uint8Array (readFile can return a
  // SharedArrayBuffer view, which the Blob constructor rejects on strict TS).
  const src = data as Uint8Array;
  const copy = new Uint8Array(new ArrayBuffer(src.byteLength));
  copy.set(src);
  const blob = new Blob([copy], { type: "video/mp4" });

  // Clean up ffmpeg's virtual FS so repeat compressions don't accumulate.
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const outName = file.name.replace(/\.[^.]+$/, "") + "_compressed.mp4";
  return new File([blob], outName, { type: "video/mp4" });
}
