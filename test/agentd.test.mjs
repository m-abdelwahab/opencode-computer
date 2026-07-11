import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import test from "node:test";

import {
  createControlServer,
  createHealthServer,
  createOpenCodeInspector,
  startAgentd,
} from "../src/agentd.mjs";

const readyRuntime = {
  opencode: { expected: "1.17.18", actual: "1.17.18" },
  railway: { expected: "5.26.0", actual: "railway 5.26.0" },
  node: "v22.23.1",
};

const readyStorage = () => ({ ready: true, missing: [] });
const readyOpenCode = async () => ({ ready: true, version: "1.17.18" });

async function withServer(factory, options, run) {
  const server = factory(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("OpenCode inspector authenticates and validates health", async () => {
  let request;
  const inspector = createOpenCodeInspector({
    baseUrl: "http://127.0.0.1:4096",
    username: "opencode",
    passwordFile: "/credential",
    readFileImpl: (path, encoding) => {
      assert.equal(path, "/credential");
      assert.equal(encoding, "utf8");
      return "test-password\n";
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({ healthy: true, version: "1.17.18" }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(await inspector(), { ready: true, version: "1.17.18" });
  assert.equal(request.url, "http://127.0.0.1:4096/global/health");
  assert.equal(
    request.options.headers.authorization,
    `Basic ${Buffer.from("opencode:test-password").toString("base64")}`,
  );
});

test("health endpoint reports the daemon version", async () => {
  await withServer(
    createControlServer,
    {
      runtime: readyRuntime,
      storageInspector: readyStorage,
      openCodeInspector: readyOpenCode,
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/healthz`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        service: "agentd",
        version: "0.1.0",
      });
    },
  );
});

test("readiness fails closed when storage is missing", async () => {
  await withServer(
    createControlServer,
    {
      runtime: readyRuntime,
      storageInspector: () => ({
        ready: false,
        missing: ["/data/workspace"],
      }),
      openCodeInspector: readyOpenCode,
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.ready, false);
      assert.deepEqual(body.storage.missing, ["/data/workspace"]);
    },
  );
});

test("readiness fails when the OpenCode binary version differs", async () => {
  await withServer(
    createControlServer,
    {
      runtime: {
        ...readyRuntime,
        opencode: { expected: "1.17.18", actual: "1.17.17" },
      },
      storageInspector: readyStorage,
      openCodeInspector: async () => ({ ready: true, version: "1.17.17" }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).ready, false);
    },
  );
});

test("readiness fails when the OpenCode server is unavailable", async () => {
  await withServer(
    createControlServer,
    {
      runtime: readyRuntime,
      storageInspector: readyStorage,
      openCodeInspector: async () => ({
        ready: false,
        error: "unreachable",
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.openCode.error, "unreachable");
    },
  );
});

test("info advertises the native server but no unfinished UI bridge", async () => {
  await withServer(
    createControlServer,
    {
      runtime: readyRuntime,
      storageInspector: readyStorage,
      openCodeInspector: readyOpenCode,
      startedAt: new Date("2026-07-11T00:00:00Z"),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/info`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.capabilities, {
        health: true,
        runtimeInfo: true,
        openCodeServer: true,
        chat: false,
        files: false,
        terminal: false,
      });
      assert.equal(body.openCode.version, "1.17.18");
      assert.equal(body.protocolVersion, "2026-07-11");
      assert.equal(body.startedAt, "2026-07-11T00:00:00.000Z");
    },
  );
});

test("unknown paths and mutations are rejected", async () => {
  await withServer(
    createControlServer,
    {
      runtime: readyRuntime,
      storageInspector: readyStorage,
      openCodeInspector: readyOpenCode,
    },
    async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/unknown`);
      assert.equal(missing.status, 404);

      const mutation = await fetch(`${baseUrl}/healthz`, { method: "POST" });
      assert.equal(mutation.status, 405);
    },
  );
});

test("Railway health listener exposes no runtime metadata", async () => {
  await withServer(
    createHealthServer,
    {
      runtime: readyRuntime,
      storageInspector: readyStorage,
      openCodeInspector: readyOpenCode,
    },
    async (baseUrl) => {
      const live = await fetch(`${baseUrl}/livez`);
      assert.deepEqual(await live.json(), { ok: true });

      const ready = await fetch(`${baseUrl}/readyz`);
      assert.deepEqual(await ready.json(), { ready: true });

      const info = await fetch(`${baseUrl}/v1/info`);
      assert.equal(info.status, 404);
    },
  );
});

test("startup closes the first listener when the second bind fails", async () => {
  const reservation = createControlServer({
    runtime: readyRuntime,
    storageInspector: readyStorage,
    openCodeInspector: readyOpenCode,
  });
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert.equal(typeof address, "object");
  const port = address.port;
  reservation.close();
  await once(reservation, "close");

  await assert.rejects(
    startAgentd({
      controlHost: "127.0.0.1",
      controlPort: port,
      healthHost: "127.0.0.1",
      healthPort: port,
    }),
    (error) => error?.code === "EADDRINUSE",
  );

  const probe = createControlServer({
    runtime: readyRuntime,
    storageInspector: readyStorage,
    openCodeInspector: readyOpenCode,
  });
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  probe.close();
  await once(probe, "close");
});

test("malformed request targets return 400 without crashing", async () => {
  const server = createHealthServer({
    runtime: readyRuntime,
    storageInspector: readyStorage,
    openCodeInspector: readyOpenCode,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");

  const socket = createConnection(address.port, "127.0.0.1");
  socket.setEncoding("utf8");
  await once(socket, "connect");
  socket.write("GET http://[ HTTP/1.1\r\nHost: health.local\r\nConnection: close\r\n\r\n");

  let response = "";
  socket.on("data", (chunk) => {
    response += chunk;
  });
  await once(socket, "end");

  assert.match(response, /^HTTP\/1\.1 400 Bad Request/m);
  assert.equal(server.listening, true);
  server.close();
  await once(server, "close");
});
