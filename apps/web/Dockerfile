# syntax=docker/dockerfile:1
# ── Praxarch Web (Next.js) ────────────────────────────────────────────
# Multi-stage: `deps` → `dev` (hot reload) / `build` → `prod` (standalone).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# ── Development target (used by docker-compose) ──
FROM node:20-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Build target ──
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production runtime ──
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
