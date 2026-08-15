export const COMPRESSION_THRESHOLD_BYTES = 80 * 1024 * 1024;

const CDN = "https://unpkg.com";
const FFMPEG_VERSION = "0.12.15";
const UTIL_VERSION = "0.12.2";
const CORE_VERSION = "0.12.10";

/* eslint-disable @typescript-eslint/no-explicit-any */
let ffmpegInstance: any = null;
let loadPromise: Promise<any> | null = null;

async function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
}

async function loadFFmpeg(onLog?: (msg: string) => void) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load ffmpeg.wasm UMD bundles from CDN — avoids all bundler resolution
    // issues (Turbopack picks the "node" exports condition and gets an empty stub).
    await loadScript(`${CDN}/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/ffmpeg.js`);
    await loadScript(`${CDN}/@ffmpeg/util@${UTIL_VERSION}/dist/umd/util.js`);

    const FFmpegWASM = (globalThis as any).FFmpegWASM;
    const FFmpegUtil = (globalThis as any).FFmpegUtil;

    if (!FFmpegWASM?.FFmpeg) throw new Error("FFmpeg WASM failed to load from CDN");
    if (!FFmpegUtil?.toBlobURL) throw new Error("FFmpeg util failed to load from CDN");

    const ffmpeg = new FFmpegWASM.FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }: { message: string }) => onLog(message));

    const coreBase = `${CDN}/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
    await ffmpeg.load({
      coreURL: await FFmpegUtil.toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await FFmpegUtil.toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
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

  const ffmpeg = await loadFFmpeg();
  const FFmpegUtil = (globalThis as any).FFmpegUtil;

  const inputName = "input" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
  const outputName = "output.mp4";

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      onProgress(Math.min(1, Math.max(0, progress)));
    });
  }

  await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(file));

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
