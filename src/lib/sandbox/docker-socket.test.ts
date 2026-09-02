import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WINDOWS_DOCKER_PIPES,
  dockerSocketIsPresent,
  isWindowsNamedPipe,
  resolveDockerSocketPath,
  windowsPipeName,
} from "./docker-socket.ts";

test("unix default is the engine socket", () => {
  assert.equal(
    resolveDockerSocketPath({ platform: "linux", envSocket: "", exists: () => false }),
    "/var/run/docker.sock",
  );
});

test("unix honors DOCKER_SOCKET", () => {
  assert.equal(
    resolveDockerSocketPath({
      platform: "linux",
      envSocket: "/custom/docker.sock",
      exists: () => false,
    }),
    "/custom/docker.sock",
  );
});

test("windows prefers a pipe that actually exists", () => {
  assert.equal(
    resolveDockerSocketPath({
      platform: "win32",
      envSocket: "\\\\.\\pipe\\docker_engine",
      exists: (p) => p === WINDOWS_DOCKER_PIPES[0],
    }),
    WINDOWS_DOCKER_PIPES[0],
  );
});

test("windows uses configured pipe when it exists", () => {
  assert.equal(
    resolveDockerSocketPath({
      platform: "win32",
      envSocket: "\\\\.\\pipe\\docker_engine",
      exists: (p) => p === "\\\\.\\pipe\\docker_engine",
    }),
    "\\\\.\\pipe\\docker_engine",
  );
});

test("windows falls back to Desktop Linux engine when nothing exists", () => {
  assert.equal(
    resolveDockerSocketPath({ platform: "win32", envSocket: "", exists: () => false }),
    WINDOWS_DOCKER_PIPES[0],
  );
});

test("missing socket is not present", () => {
  assert.equal(dockerSocketIsPresent("/missing", () => false), false);
  assert.equal(dockerSocketIsPresent("/present", () => true), true);
});

test("windows named pipe paths are detected", () => {
  assert.equal(isWindowsNamedPipe("\\\\.\\pipe\\dockerDesktopLinuxEngine"), true);
  assert.equal(windowsPipeName("\\\\.\\pipe\\dockerDesktopLinuxEngine"), "dockerDesktopLinuxEngine");
  assert.equal(isWindowsNamedPipe("/var/run/docker.sock"), false);
});
