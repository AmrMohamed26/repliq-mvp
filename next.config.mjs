/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
  // Prevent Next.js from bundling these packages — they must load as plain
  // node_modules so BullMQ can resolve __dirname-relative worker scripts,
  // and native addons (playwright, ffmpeg) can find their binaries.
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "busboy",
    "fluent-ffmpeg",
    "ffmpeg-static",
    "ffprobe-static",
    "playwright",
    "pino",
    "pino-pretty",
    "@remotion/renderer",
    "@remotion/bundler",
    "remotion",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.cloudflarestorage.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  webpack: (config) => {
    // @remotion/renderer uses native addons not compatible with webpack bundling.
    config.externals = config.externals || [];
    config.externals.push({ "@remotion/renderer": "commonjs @remotion/renderer" });
    return config;
  },
};

export default nextConfig;
