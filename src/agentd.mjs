import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants as fsConstants,
  readFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const AGENTD_VERSION = "0.1.0";
export const PROTOCOL_VERSION = "2026-07-11";

const requiredPaths = [
  "/data/workspace",
  "/data/skills",
  "/data/agentd/private",
  "/data/agentd/state",
  "/data/control/opencode-server-password",
  "/data/trash",
];

function commandVersion(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function inspectRuntime() {
  return {
    opencode: {
      expected: process.env.OPENCODE_CLI_VERSION || null,
      actual: commandVersion("/usr/local/bin/opencode", ["--version"]),
    },
    railway: {
      expected: process.env.RAILWAY_CLI_VERSION || null,
      actual: commandVersion("/usr/local/bin/railway", ["--version"]),
    },
    node: process.version,
  };
}

export function inspectStorage(paths = requiredPaths) {
  const missing = [];

  for (const path of paths) {
    try {
      accessSync(path, fsConstants.R_OK);
    } catch {
      missing.push(path);
    }
  }

  return { ready: missing.length === 0, missing };
}

export function createOpenCodeInspector({
  baseUrl = process.env.OPENCODE_SERVER_URL ?? "http://127.0.0.1:4096",
  username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
  passwordFile =
    process.env.OPENCODE_SERVER_PASSWORD_FILE ??
    "/data/control/opencode-server-password",
  fetchImpl = fetch,
  readFileImpl = readFileSync,
} = {}) {
  let authorization;

  return async () => {
    try {
      if (!authorization) {
        const password = readFileImpl(passwordFile, "utf8").trim();
        if (!password) return { ready: false, error: "credential_empty" };
        authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      }

      const response = await fetchImpl(`${baseUrl}/global/health`, {
        headers: { authorization },
        signal: AbortSignal.timeout(3_000),
      });

      if (!response.ok) {
        return { ready: false, error: `http_${response.status}` };
      }

      const body = await response.json();
      if (body?.healthy !== true || typeof body.version !== "string") {
        return { ready: false, error: "invalid_response" };
      }

      return { ready: true, version: body.version };
    } catch {
      return { ready: false, error: "unreachable" };
    }
  };
}

function runtimeIsReady(runtime) {
  const { actual, expected } = runtime.opencode ?? {};
  return Boolean(actual) && (!expected || actual === expected);
}

async function readiness(runtime, storageInspector, openCodeInspector) {
  const [storage, openCode] = await Promise.all([
    Promise.resolve(storageInspector()),
    Promise.resolve(openCodeInspector()),
  ]);
  const versionMatches =
    openCode.ready &&
    (!runtime.opencode?.actual || openCode.version === runtime.opencode.actual);

  return {
    ready: storage.ready && runtimeIsReady(runtime) && versionMatches,
    runtime,
    storage,
    openCode,
  };
}

function sendJson(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function parseUrl(request, response, baseUrl) {
  try {
    return new URL(request.url ?? "/", baseUrl);
  } catch {
    sendJson(response, 400, { error: "invalid_request_target" });
    return null;
  }
}

function hardenServer(server) {
  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  server.maxRequestsPerSocket = 100;
  return server;
}

function rejectUnsupportedRequest(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return true;
  }
  return false;
}

export function createHealthServer({
  runtime = inspectRuntime(),
  storageInspector = () => inspectStorage(),
  openCodeInspector = createOpenCodeInspector(),
} = {}) {
  return hardenServer(createServer((request, response) => {
    if (rejectUnsupportedRequest(request, response)) return;

    const url = parseUrl(request, response, "http://health.local");
    if (!url) return;

    if (url.pathname === "/livez") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/readyz") {
      void readiness(runtime, storageInspector, openCodeInspector)
        .then((status) => {
          sendJson(response, status.ready ? 200 : 503, {
            ready: status.ready,
          });
        })
        .catch(() => sendJson(response, 503, { ready: false }));
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  }));
}

export function createControlServer({
  runtime = inspectRuntime(),
  storageInspector = () => inspectStorage(),
  openCodeInspector = createOpenCodeInspector(),
  startedAt = new Date(),
} = {}) {
  return hardenServer(createServer((request, response) => {
    if (rejectUnsupportedRequest(request, response)) return;

    const url = parseUrl(request, response, "http://agentd.local");
    if (!url) return;

    if (url.pathname === "/healthz") {
      sendJson(response, 200, {
        ok: true,
        service: "agentd",
        version: AGENTD_VERSION,
      });
      return;
    }

    if (url.pathname === "/readyz") {
      void readiness(runtime, storageInspector, openCodeInspector)
        .then((status) =>
          sendJson(response, status.ready ? 200 : 503, status),
        )
        .catch(() =>
          sendJson(response, 503, {
            ready: false,
            runtime,
            storage: { ready: false, missing: [] },
            openCode: { ready: false, error: "inspection_failed" },
          }),
        );
      return;
    }

    if (url.pathname === "/v1/info") {
      void openCodeInspector()
        .then((openCode) =>
          sendJson(response, 200, {
            service: "agentd",
            version: AGENTD_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            computerId: process.env.AGENT_COMPUTER_ID ?? null,
            startedAt: startedAt.toISOString(),
            runtime,
            openCode,
            capabilities: {
              health: true,
              runtimeInfo: true,
              openCodeServer: true,
              chat: false,
              files: false,
              terminal: false,
            },
          }),
        )
        .catch(() =>
          sendJson(response, 200, {
            service: "agentd",
            version: AGENTD_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            computerId: process.env.AGENT_COMPUTER_ID ?? null,
            startedAt: startedAt.toISOString(),
            runtime,
            openCode: { ready: false, error: "inspection_failed" },
            capabilities: {
              health: true,
              runtimeInfo: true,
              openCodeServer: true,
              chat: false,
              files: false,
              terminal: false,
            },
          }),
        );
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  }));
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function startAgentd({
  controlHost = process.env.AGENTD_CONTROL_HOST ?? "127.0.0.1",
  controlPort = Number.parseInt(process.env.AGENTD_CONTROL_PORT ?? "43117", 10),
  healthHost = process.env.AGENTD_HEALTH_HOST ?? "0.0.0.0",
  healthPort = Number.parseInt(process.env.PORT ?? "8080", 10),
} = {}) {
  for (const [name, port] of [
    ["AGENTD_CONTROL_PORT", controlPort],
    ["PORT", healthPort],
  ]) {
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      throw new Error(`Invalid ${name}: ${port}`);
    }
  }

  const runtime = inspectRuntime();
  const openCodeInspector = createOpenCodeInspector();
  const controlServer = createControlServer({ runtime, openCodeInspector });
  const healthServer = createHealthServer({ runtime, openCodeInspector });

  const startedServers = [];
  try {
    await listen(controlServer, controlPort, controlHost);
    startedServers.push(controlServer);
    await listen(healthServer, healthPort, healthHost);
    startedServers.push(healthServer);
  } catch (error) {
    await Promise.allSettled(startedServers.map((server) => closeServer(server)));
    throw error;
  }

  const controlAddress = controlServer.address();
  const healthAddress = healthServer.address();
  const initialReadiness = await readiness(
    runtime,
    () => inspectStorage(),
    openCodeInspector,
  );

  process.stdout.write(
    `${JSON.stringify({
      event: "agentd.listening",
      control: {
        host: controlHost,
        port:
          typeof controlAddress === "object" && controlAddress
            ? controlAddress.port
            : controlPort,
      },
      health: {
        host: healthHost,
        port:
          typeof healthAddress === "object" && healthAddress
            ? healthAddress.port
            : healthPort,
      },
      ready: initialReadiness.ready,
      runtime: initialReadiness.runtime,
      storage: initialReadiness.storage,
      openCode: initialReadiness.openCode,
      identity: {
        uid: process.getuid?.() ?? null,
        gid: process.getgid?.() ?? null,
        groups: process.getgroups?.() ?? [],
      },
    })}\n`,
  );

  return { controlServer, healthServer };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const servers = await startAgentd();
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await Promise.all([
        closeServer(servers.controlServer),
        closeServer(servers.healthServer),
      ]);
    } catch (error) {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
