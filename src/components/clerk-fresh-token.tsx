"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Clerk's session token lives ~60s and is refreshed by a background timer, which browsers
 * throttle in idle tabs. A write sent with an expired cookie reaches requireOwner() signed
 * out and gets a 403. So before any same-origin /api write, ask Clerk for a token (it
 * refreshes an expired one) and send it as a Bearer header, which clerkMiddleware prefers.
 */
export function ClerkFreshToken() {
  const clerk = useClerk();

  useEffect(() => {
    const original = window.fetch;

    window.fetch = async (input, init) => {
      // Read the URL and method without building a Request, which can consume or reject a body.
      const rawUrl = input instanceof Request ? input.url : input.toString();
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(rawUrl, window.location.href);
      const isApiWrite =
        url.origin === window.location.origin && url.pathname.startsWith("/api/") && WRITE_METHODS.has(method);
      const existing = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

      if (isApiWrite && clerk.session && !existing.has("Authorization")) {
        try {
          const token = await clerk.session.getToken();
          if (token) {
            existing.set("Authorization", `Bearer ${token}`);
            return original(input, { ...init, headers: existing });
          }
        } catch {
          // Fall through to the plain request; the server decides.
        }
      }
      return original(input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, [clerk]);

  return null;
}
