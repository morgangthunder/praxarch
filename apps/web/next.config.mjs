// Surfaced on every boot so you can confirm the running build (per project convention).
const WEB_VERSION = "0.2.0";
console.log(`🟣 Praxarch Web v${WEB_VERSION} — API: ${process.env.API_BASE_URL ?? "http://localhost:3901"}`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The frontend talks only to its own BFF routes + the NestJS gateway.
  env: {
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3901",
  },
};

export default nextConfig;
