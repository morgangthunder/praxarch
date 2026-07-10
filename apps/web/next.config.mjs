// Surfaced on every boot so you can confirm the running build (per project convention).
const WEB_VERSION = "0.16.31";
console.log(`🟣 Praxarch Web v${WEB_VERSION} — API: ${process.env.API_BASE_URL ?? "http://localhost:3901"}`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide Next.js's on-screen "Turbopack"/build dev indicator badge (bottom corner).
  // This is Next's own bundler overlay, not a Praxarch component.
  devIndicators: false,
  // The frontend talks only to its own BFF routes + the NestJS gateway.
  env: {
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3901",
    // Inlined into client bundles — surfaced in the browser console via VersionLogger.
    NEXT_PUBLIC_WEB_VERSION: WEB_VERSION,
  },
};

export default nextConfig;
