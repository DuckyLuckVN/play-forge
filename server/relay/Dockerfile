# Game relay server. Build from the repo root (it needs engine/net/relay-protocol.ts):
#   docker build -f server/relay/Dockerfile -t play-forge-relay .
FROM node:22-alpine
WORKDIR /app/server/relay
COPY server/relay/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY engine/net/relay-protocol.ts /app/engine/net/relay-protocol.ts
COPY server/relay/hub.ts server/relay/main.ts server/relay/turn.ts ./
ENV NODE_ENV=production PORT=8080 METRICS_PORT=9464
USER node
EXPOSE 8080 9464
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "main.ts"]
