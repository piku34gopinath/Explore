import type { NextConfig } from "next";
import path from "path";

// Trigger rebuild 4

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
    resolveAlias: {
      "@ffmpeg/ffmpeg": path.resolve(__dirname, "node_modules/@ffmpeg/ffmpeg/dist/esm/index.js"),
      "@ffmpeg/util": path.resolve(__dirname, "node_modules/@ffmpeg/util/dist/esm/index.js"),
    },
  },
  async headers() {
    // ffmpeg.wasm requires SharedArrayBuffer, which needs cross-origin isolation.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
