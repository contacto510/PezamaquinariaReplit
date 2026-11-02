import assert from "node:assert/strict";
import test from "node:test";
import { checkSession } from "./session-check";

const authenticated = () => new Response(JSON.stringify({
  authenticated: true, user: { email: "test@example.invalid" },
}), { status: 200, headers: { "Content-Type": "application/json" } });

test("server session confirmation includes cookies and disables cache", async () => {
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/me");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    return authenticated();
  };
  assert.deepEqual(await checkSession({ fetchImpl }), {
    status: "authenticated", email: "test@example.invalid",
  });
});

test("an explicit 401 revokes access immediately without retrying", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response('{"authenticated":false}', { status: 401 });
  };
  assert.deepEqual(await checkSession({ fetchImpl }), { status: "unauthenticated" });
  assert.equal(calls, 1);
});

test("transient network and 503 failures recover without requesting a login", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError("Failed to fetch");
    if (calls === 2) return new Response("temporarily unavailable", { status: 503 });
    return authenticated();
  };
  assert.equal((await checkSession({ fetchImpl, retryDelayMs: 0 })).status, "authenticated");
  assert.equal(calls, 3);
});

test("persistent network failure is unavailable, not expired or authenticated", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; throw new TypeError("offline"); };
  assert.deepEqual(await checkSession({ fetchImpl, retryDelayMs: 0 }), { status: "unavailable" });
  assert.equal(calls, 3);
});

test("proxy HTML, forbidden responses and malformed JSON do not establish session expiry", async () => {
  for (const response of [
    () => new Response("<html>Gateway login</html>", { status: 200 }),
    () => new Response("Forbidden", { status: 403 }),
    () => new Response('{"authenticated":false}', { status: 200 }),
    () => new Response('{"authenticated":true}', { status: 200 }),
    () => new Response("Internal server error", { status: 500 }),
  ]) {
    const fetchImpl: typeof fetch = async () => response();
    assert.deepEqual(await checkSession({ fetchImpl, retryDelayMs: 0 }), { status: "unavailable" });
  }
});

test("a timed out request is aborted and retried with bounded attempts", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
    });
  };
  assert.deepEqual(await checkSession({ fetchImpl, timeoutMs: 5, retryDelayMs: 0 }), { status: "unavailable" });
  assert.equal(calls, 3);
});

test("cancelled checks cannot replace newer login or logout state", async () => {
  const controller = new AbortController();
  const fetchImpl: typeof fetch = async () => {
    controller.abort();
    return authenticated();
  };
  await assert.rejects(checkSession({ fetchImpl, signal: controller.signal }), { name: "AbortError" });
});
