export const COMPRESSION_THRESHOLD_BYTES = 80 * 1024 * 1024;

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

async function loadFFmpeg(onLog?: (msg: string) => void) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Dynamic import avoids Turbopack resolving the "node" export condition
    // at build time (which maps to an empty stub that throws).
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }: { message: string }) => onLog(message));

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
  onProgress?: (fraction: number) => void;
  targetHeight?: number;
  crf?: number;
}

export async function compressVideo(
  file: File,
  { onProgress, targetHeight = 720, crf = 28 }: CompressOptions = {},
): Promise<File> {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "This page isn't cross-origin isolated (SharedArrayBuffer unavailable). Reload the app once so the new headers take effect.",
    );
  }

  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await loadFFmpeg();

  const inputName = "input" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
  const outputName = "output.mp4";

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      onProgress(Math.min(1, Math.max(0, progress)));
    });
  }

  await ffmpeg.writeFile(inputName, await fetchFile(file));

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
  const src = data as Uint8Array;
  const copy = new Uint8Array(new ArrayBuffer(src.byteLength));
  copy.set(src);
  const blob = new Blob([copy], { type: "video/mp4" });

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const outName = file.name.replace(/\.[^.]+$/, "") + "_compressed.mp4";
  return new File([blob], outName, { type: "video/mp4" });
}
