# syntax=docker/dockerfile:1
# ── Praxarch API (NestJS) ─────────────────────────────────────────────
# Multi-stage: `deps` → `dev` (hot reload) / `build` → `prod` (slim runtime).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
# No lockfile committed yet → install (generates one inside the image).
RUN npm install

# ── Development target (used by docker-compose) ──
FROM node:20-alpine AS dev
RUN apk add --no-cache openssh-client openssh-keygen docker-cli aws-cli
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3901
CMD ["npm", "run", "start:dev"]

# ── Build target ──
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production runtime ──
FROM node:20-alpine AS prod
RUN apk add --no-cache openssh-client openssh-keygen
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3901
CMD ["node", "dist/main.js"]
