import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dockerDaemonUnreachableHint,
  resolveDockerSandboxEndpoint,
} from "./docker-endpoint.ts";

test("Hostinger local default is 1 GB and the unix socket", () => {
  const e = resolveDockerSandboxEndpoint({
    SANDBOX_MEMORY_MB: undefined,
    SANDBOX_DOCKER_HOST: undefined,
    DOCKER_HOST: undefined,
  });
  assert.equal(e.kind, "local");
  assert.equal(e.tcpHost, "");
  assert.equal(e.memoryMb, 1024);
  assert.equal(e.cpus, 1);
});

test("local SANDBOX_MEMORY_MB stays 1 GB when Oracle is not configured", () => {
  const e = resolveDockerSandboxEndpoint({
    SANDBOX_MEMORY_MB: "1024",
    SANDBOX_REMOTE_MEMORY_MB: "2048",
    SANDBOX_DOCKER_HOST: "",
  });
  assert.equal(e.kind, "local");
  assert.equal(e.memoryMb, 1024);
});

test("SANDBOX_DOCKER_HOST is the primary daemon at 2 GB", () => {
  const e = resolveDockerSandboxEndpoint({
    SANDBOX_DOCKER_HOST: "http://172.17.0.1:2375",
    SANDBOX_MEMORY_MB: "1024",
    DOCKER_HOST: "http://127.0.0.1:2375",
  });
  assert.equal(e.kind, "remote");
  assert.equal(e.tcpHost, "http://172.17.0.1:2375");
  assert.equal(e.memoryMb, 2048);
});

test("remote memory override does not change Hostinger's SANDBOX_MEMORY_MB", () => {
  const e = resolveDockerSandboxEndpoint({
    SANDBOX_DOCKER_HOST: "http://172.17.0.1:2375",
    SANDBOX_REMOTE_MEMORY_MB: "2048",
    SANDBOX_MEMORY_MB: "1024",
  });
  assert.equal(e.memoryMb, 2048);
});

test("remote host does not inherit local DOCKER_HOST", () => {
  const e = resolveDockerSandboxEndpoint({
    SANDBOX_DOCKER_HOST: "http://10.0.0.12:2375",
    DOCKER_HOST: "http://127.0.0.1:2375",
  });
  assert.equal(e.tcpHost, "http://10.0.0.12:2375");
});

test("unreachable remote does not tell operators to mount the app-host socket", () => {
  const hint = dockerDaemonUnreachableHint({
    configured: true,
    reachable: false,
    hostKind: "remote",
    platform: "linux",
  });
  assert.match(hint ?? "", /SANDBOX_DOCKER_HOST/);
  assert.doesNotMatch(hint ?? "", /docker\.sock/);
});

test("unreachable local still asks for the Coolify socket", () => {
  const hint = dockerDaemonUnreachableHint({
    configured: true,
    reachable: false,
    hostKind: "local",
    platform: "linux",
  });
  assert.match(hint ?? "", /docker\.sock/);
});

test("reachable or unconfigured produces no hint", () => {
  assert.equal(
    dockerDaemonUnreachableHint({ configured: true, reachable: true, hostKind: "remote" }),
    null,
  );
  assert.equal(
    dockerDaemonUnreachableHint({ configured: false, reachable: false, hostKind: "local" }),
    null,
  );
});
