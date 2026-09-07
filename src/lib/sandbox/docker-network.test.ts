import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COOLIFY_PROXY_NETWORK,
  DEFAULT_SANDBOX_NETWORK,
  pickProxyNetworkName,
  proxyNetworkConnectOk,
  proxyNetworkMissingError,
  publicGatewayDown,
  sandboxRunningFilter,
  shouldRejoinProxyNetwork,
} from "./docker-network.ts";

test("explicit SANDBOX_PROXY_NETWORK always wins", () => {
  assert.equal(pickProxyNetworkName("coolify", []), "coolify");
  assert.equal(pickProxyNetworkName("custom-net", ["coolify"]), "custom-net");
});

test("auto-picks Coolify Traefik network when it exists", () => {
  assert.equal(pickProxyNetworkName("", ["bridge", "coolify"]), COOLIFY_PROXY_NETWORK);
});

test("falls back to a dedicated preview network when Coolify is absent", () => {
  assert.equal(pickProxyNetworkName(null, ["bridge"]), DEFAULT_SANDBOX_NETWORK);
});

test("missing coolify network is a configuration error, not a create", () => {
  assert.ok(proxyNetworkMissingError("coolify"));
  assert.equal(proxyNetworkMissingError(DEFAULT_SANDBOX_NETWORK), null);
});

test("already-connected Docker network attach is success", () => {
  assert.equal(proxyNetworkConnectOk(200), true);
  assert.equal(proxyNetworkConnectOk(403, "already connected"), true);
  assert.equal(proxyNetworkConnectOk(409, "already exists"), true);
  assert.equal(proxyNetworkConnectOk(404, "network not found"), false);
});

test("public 502 with an inner server already attached needs a Traefik rejoin", () => {
  assert.equal(publicGatewayDown(502), true);
  assert.equal(publicGatewayDown(200), false);
  assert.equal(shouldRejoinProxyNetwork({ innerServing: true, newlyAttached: false, publicStatus: 502 }), true);
  assert.equal(shouldRejoinProxyNetwork({ innerServing: true, newlyAttached: true, publicStatus: 502 }), false);
  assert.equal(shouldRejoinProxyNetwork({ innerServing: false, newlyAttached: false, publicStatus: 502 }), false);
  assert.equal(shouldRejoinProxyNetwork({ innerServing: true, newlyAttached: false, publicStatus: 200 }), false);
});

test("healer only targets running sandbox containers", () => {
  assert.deepEqual(sandboxRunningFilter(), {
    label: ["lifemark.sandbox=1"],
    status: ["running"],
  });
});
