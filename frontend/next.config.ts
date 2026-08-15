import type { NextConfig } from "next";
import path from "path";

// Trigger rebuild 4

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin Turbopack to the frontend/ dir so it doesn't pick up a stray lockfile
  // one directory up and try to resolve node_modules from there.
  turbopack: {
    root: path.resolve(__dirname),
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
