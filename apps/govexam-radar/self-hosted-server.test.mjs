import test from "node:test";
import assert from "node:assert/strict";
import { createNodeServer, createRuntimeEnvironment } from "./self-hosted-server.mjs";

async function withServer(options, run) {
  const server = createNodeServer(options);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("routes HTTP requests through the existing Fetch API worker", async () => {
  const db = { prepare: sql => ({ bind: value => ({ first: async () => ({ version: value }) }) }) };
  await withServer({
    db,
    publicOrigin: "http://127.0.0.1:8080",
    workerImpl: { fetch: async request => new Response(JSON.stringify({ path: new URL(request.url).pathname }), { headers: { "Content-Type": "application/json" } }) }
  }, async origin => {
    const response = await fetch(origin + "/api/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { path: "/api/health" });
  });
});

test("serves readiness only when the required schema marker exists", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ version: "001_core" }) }) }) };
  await withServer({ db, workerImpl: { fetch: async () => new Response("not_used") } }, async origin => {
    const response = await fetch(origin + "/internal/ready");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", database: "ready" });
  });
});

test("rejects oversized request bodies before invoking the worker", async () => {
  let called = false;
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ version: "001_core" }) }) }) };
  await withServer({
    db,
    maxBodyBytes: 1024,
    workerImpl: { fetch: async () => { called = true; return new Response("unexpected"); } }
  }, async origin => {
    const response = await fetch(origin + "/api/collector/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(2048)
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "request_body_too_large" });
    assert.equal(called, false);
  });
});

test("rejects protocol-relative request targets and invalid public origins", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ version: "001_core" }) }) }) };
  assert.throws(() => createNodeServer({ db, publicOrigin: "https://user:pass@example.test" }), /invalid_public_origin/);
});

test("runtime environment passes the PostgreSQL source-policy registry fail-closed",()=>{
 const db={};
 const pool={query(){}};
 const runtime=createRuntimeEnvironment({db,pool,env:{REQUIRE_SOURCE_POLICY_REGISTRY:"true"}});
 assert.equal(runtime.DB,db);
 assert.equal(runtime.SOURCE_POLICY_POOL,pool);
 assert.equal(runtime.REQUIRE_SOURCE_POLICY_REGISTRY,"true");
 const disabled=createRuntimeEnvironment({db,pool,env:{}});
 assert.equal(disabled.REQUIRE_SOURCE_POLICY_REGISTRY,"true");
});
