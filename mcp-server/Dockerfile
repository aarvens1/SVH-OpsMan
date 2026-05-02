# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Install production deps in the final image so platform-specific native addons
# (e.g. @bitwarden/sdk-napi) are built for the correct target architecture.
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# MCP servers communicate over stdio — no port is exposed.
# Pass BWS_ACCESS_TOKEN at runtime; the server fetches all other credentials
# from Bitwarden Secrets Manager on startup.
CMD ["node", "dist/index.js"]
