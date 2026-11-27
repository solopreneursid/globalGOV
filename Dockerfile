FROM node:26-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY apps/govexam-radar/package.json apps/govexam-radar/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY apps/govexam-radar/ ./
COPY infra/self-hosted/postgres/ ./migrations/

RUN mkdir -p /var/lib/globalgov/documents \
    && chmod 700 /var/lib/globalgov/documents \
    && chown -R node:node /app /var/lib/globalgov

USER node
EXPOSE 8080
CMD ["node", "self-hosted-server.mjs"]
