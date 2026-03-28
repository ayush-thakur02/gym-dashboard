# ── HuggingFace Spaces compatible Dockerfile ──────────
# Port 7860 is required by HuggingFace Spaces

FROM node:20-alpine AS base

# Install build tools needed for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create data directory (SQLite DB will live here at runtime)
RUN mkdir -p /app/data

# HuggingFace runs as non-root user 1000
RUN chown -R 1000:1000 /app
USER 1000

EXPOSE 7860

ENV PORT=7860 \
    NODE_ENV=production \
    DB_PATH=/app/data/gym.sqlite

CMD ["node", "server.js"]
