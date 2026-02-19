import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  const baseUrl = getApiBaseUrl();
  console.log("[tRPC] Creating client with baseUrl:", baseUrl);
  
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        maxURLLength: 2083,
        async headers() {
          const token = await Auth.getSessionToken();
          console.log("[tRPC] headers() called, hasToken:", !!token);
          if (token) {
            console.log("[tRPC] Adding Authorization header with token:", token.substring(0, 30) + "...");
          }
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth
        fetch(url, options) {
          console.log("[tRPC] fetch() called:", { url: String(url).substring(0, 100), method: options?.method || "GET" });
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          return fetch(url, {
            ...options,
            credentials: "include",
            signal: controller.signal,
          }).then(response => {
            clearTimeout(timeoutId);
            console.log("[tRPC] Response status:", response.status);
            if (!response.ok) {
              console.error("[tRPC] Request failed with status:", response.status);
            }
            return response;
          }).catch(error => {
            clearTimeout(timeoutId);
            console.error("[tRPC] Fetch error:", error);
            throw error;
          });
        },
      }),
    ],
  });
}
