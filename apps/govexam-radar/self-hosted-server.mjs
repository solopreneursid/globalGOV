import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import worker from "./worker.js";
import { createPostgresD1Database, createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { installDefaultCache } from "./memory-cache.mjs";

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

function incomingHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || ["host", "connection", "content-length", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer", "proxy-authenticate", "proxy-authorization"].includes(name.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

async function readBody(request, limit) {
  const length = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > limit) {
    const error = new Error("request_body_too_large");
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("request_body_too_large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export function createRuntimeEnvironment({ db, pool, env = process.env } = {}) {
  if (!db) throw new Error("database_adapter_required");
  const runtime = {
    DB: db,
    SOURCE_POLICY_POOL: pool,
    REQUIRE_SOURCE_POLICY_REGISTRY: "true",
    USAJOBS_FETCH: fetch
  };
  if (env.GLOBALGOV_NYC_PUBLICATION === "true") runtime.GLOBALGOV_NYC_PUBLICATION = "true";
  if (env.INGEST_HMAC_KEY) runtime.INGEST_HMAC_KEY = env.INGEST_HMAC_KEY;
  if (env.MODERATOR_TOKEN) runtime.MODERATOR_TOKEN = env.MODERATOR_TOKEN;
  if (env.SSB_AUTOMATED_ACCESS_APPROVED) runtime.SSB_AUTOMATED_ACCESS_APPROVED = env.SSB_AUTOMATED_ACCESS_APPROVED;
  return runtime;
}

export function createNodeServer({
  db,
  workerImpl = worker,
  publicOrigin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:8080",
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  logger = console,
  env = process.env
} = {}) {
  if (!db || typeof workerImpl?.fetch !== "function") throw new Error("server_dependencies_required");
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 16 * 1024 * 1024) {
    throw new Error("invalid_request_body_limit");
  }

  const origin = new URL(publicOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("invalid_public_origin");
  }
  const runtimeEnv = createRuntimeEnvironment({ db, pool: db.pool || null, env });

  const server = createServer(async (incoming, outgoing) => {
    const startedAt = Date.now();
    const method = incoming.method || "GET";
    let pathname = "/";

    try {
      if (typeof incoming.url !== "string" || !incoming.url.startsWith("/") || incoming.url.startsWith("//")) {
        sendJson(outgoing, 400, { error: "invalid_request_target" });
        return;
      }

      const url = new URL(incoming.url, origin);
      pathname = url.pathname;

      if (pathname === "/internal/ready") {
        if (method !== "GET" && method !== "HEAD") {
          sendJson(outgoing, 405, { error: "method_not_allowed" });
          return;
        }
        const migration = await db.prepare("SELECT version FROM schema_migrations WHERE version=?")
          .bind("001_core").first();
        const operations = await db.prepare("SELECT version FROM schema_migrations WHERE version=?")
          .bind("002_first_party_operations").first();
        if (!migration || !operations) {
          sendJson(outgoing, 503, { status: "not_ready", reason: "database_schema_not_migrated" });
          return;
        }
        outgoing.statusCode = 200;
        outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
        outgoing.setHeader("Cache-Control", "no-store");
        outgoing.end(method === "HEAD" ? undefined : JSON.stringify({ status: "ok", database: "ready" }));
        return;
      }

      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(incoming, maxBodyBytes);
      const controller = new AbortController();
      incoming.once("aborted", () => controller.abort());
      outgoing.once("close", () => {
        if (!outgoing.writableEnded) controller.abort();
      });

      const request = new Request(url, {
        method,
        headers: incomingHeaders(incoming.headers),
        ...(body === undefined ? {} : { body }),
        signal: controller.signal
      });
      const response = await workerImpl.fetch(request, runtimeEnv);

      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) {
        if (name.toLowerCase() === "set-cookie" && typeof response.headers.getSetCookie === "function") {
          outgoing.setHeader(name, response.headers.getSetCookie());
        } else {
          outgoing.setHeader(name, value);
        }
      }

      if (method === "HEAD" || !response.body) {
        outgoing.end();
      } else {
        await pipeline(Readable.fromWeb(response.body), outgoing);
      }

      logger.info?.(JSON.stringify({
        event: "http_request",
        method,
        path: pathname,
        status: response.status,
        durationMs: Date.now() - startedAt
      }));
    } catch (error) {
      if (outgoing.headersSent || outgoing.destroyed) {
        outgoing.destroy();
        return;
      }
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      sendJson(outgoing, status, {
        error: status === 413 ? "request_body_too_large" : status === 400 ? "bad_request" : "temporarily_unavailable"
      });
      logger.error?.(JSON.stringify({
        event: "http_request_error",
        method,
        path: pathname,
        status,
        errorName: String(error?.name || "Error")
      }));
    }
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  return server;
}

export async function startServer({ env = process.env, workerImpl = worker, logger = console } = {}) {
  const pool = await createPostgresPoolFromEnv(env);
  const db = createPostgresD1Database(pool);
  installDefaultCache();

  try {
    const migration = await db.prepare("SELECT version FROM schema_migrations WHERE version=?")
      .bind("001_core").first();
    const operations = await db.prepare("SELECT version FROM schema_migrations WHERE version=?")
      .bind("002_first_party_operations").first();
    if (!migration || !operations) throw new Error("database_schema_not_migrated");

    const server = createNodeServer({
      db,
      workerImpl,
      publicOrigin: env.PUBLIC_ORIGIN || "http://127.0.0.1:8080",
      maxBodyBytes: Number(env.MAX_REQUEST_BODY_BYTES || DEFAULT_MAX_BODY_BYTES),
      logger,
      env
    });

    const port = Number(env.PORT || 8080);
    const host = env.HOST || "0.0.0.0";
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid_server_port");

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });

    let closing;
    const close = () => {
      if (!closing) {
        closing = new Promise(resolve => server.close(resolve))
          .then(() => db.close());
      }
      return closing;
    };

    logger.info?.(JSON.stringify({ event: "server_started", host, port, publicOrigin: env.PUBLIC_ORIGIN || null }));
    return { server, db, close };
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
}

async function main() {
  const app = await startServer();
  const shutdown = signal => {
    console.info(JSON.stringify({ event: "server_shutdown", signal }));
    app.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "server_start_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
