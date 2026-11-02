export type SessionCheck =
  | { status: "authenticated"; email: string }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/**
 * A connection failure is not evidence of an expired session. Never grant
 * access from a persisted browser flag either: wait for a valid server reply.
 */
export async function checkSession(options: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
} = {}): Promise<SessionCheck> {
  const { signal, fetchImpl = fetch, timeoutMs = 8000, retryDelayMs = 400 } = options;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetchImpl("/api/me", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (response.status === 401) return { status: "unauthenticated" };
      if (!response.ok) throw new Error("Session service unavailable");
      const data = await response.json();
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (data?.authenticated !== true || typeof data.user?.email !== "string" || !data.user.email) {
        throw new Error("Invalid session response");
      }
      return { status: "authenticated", email: data.user.email };
    } catch {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      // A timeout, 5xx, proxy HTML or invalid JSON must not clear the cookie
      // or local state. Retry briefly, then offer a connection retry screen.
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
    if (attempt < 2 && retryDelayMs > 0) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, retryDelayMs * (attempt + 1));
        signal?.addEventListener("abort", finish, { once: true });
        if (signal?.aborted) finish();
      });
    }
  }
  return { status: "unavailable" };
}
