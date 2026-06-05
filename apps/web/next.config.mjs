/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The frontend talks only to its own BFF routes + the NestJS gateway.
  env: {
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3000",
  },
};

export default nextConfig;
