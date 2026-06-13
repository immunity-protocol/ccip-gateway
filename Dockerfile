# Minimal Node image for the EIP-3668 CCIP-Read gateway.
FROM node:22-slim AS base
WORKDIR /app

# Install deps (including tsx, used to run TS directly — no build step needed).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx@^4.19.2

COPY tsconfig.json ./
COPY src ./src

ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
