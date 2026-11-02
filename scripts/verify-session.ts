// Development-only authentication smoke test; no business-data mutations.
// Cookies and credentials are kept in memory and never logged.
// npx tsx scripts/verify-session.ts --development
import assert from "node:assert/strict";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(process.env.REPLIT_DEV_DOMAIN);
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const anonymous = await fetch(`${base}/api/me`, { cache: "no-store" });
assert.equal(anonymous.status, 401);
assert.match(anonymous.headers.get("cache-control") || "", /no-store/);

const login = await fetch(`${base}/api/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const setCookie = login.headers.getSetCookie().find((cookie) => cookie.startsWith("peza_session="));
assert.ok(setCookie);
// Never pass a raw cookie to assert.match: a failed assertion prints its token.
// The development proxy may rewrite SameSite=Lax to Secure; SameSite=None.
assert.ok(/HttpOnly/i.test(setCookie), "Session cookie must be HttpOnly");
assert.ok(/SameSite=(Lax|None)/i.test(setCookie), "Unexpected cookie policy");
if (/SameSite=None/i.test(setCookie)) {
  assert.ok(/;\s*Secure(?:;|$)/i.test(setCookie), "Cross-site cookie must be Secure");
}
assert.ok(/Max-Age=2592000/i.test(setCookie), "Session cookie must last 30 days");
const cookie = setCookie.split(";")[0];

for (let index = 0; index < 4; index++) {
  const session = await fetch(`${base}/api/me`, {
    cache: "no-store",
    headers: { Cookie: cookie },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);
  assert.match(session.headers.get("cache-control") || "", /no-store/);
  assert.ok(session.headers.getSetCookie().some((value) => value.startsWith("peza_session=")));
}
const protectedPage = await fetch(`${base}/api/repairs-dashboard`, { headers: { Cookie: cookie } });
assert.equal(protectedPage.status, 200);

const invalid = await fetch(`${base}/api/me`, {
  headers: { Cookie: "peza_session=invalid.invalid" },
});
assert.equal(invalid.status, 401);
assert.equal((await invalid.json()).authenticated, false);
console.log("PASS: login, 30-day HttpOnly cookie, repeated valid server checks, renewal, no-store, protected access and invalid-cookie rejection. No business data changed.");
