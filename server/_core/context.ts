import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  // Log incoming request info for debugging
  const authHeader = opts.req.headers.authorization || opts.req.headers.Authorization;
  const hasCookie = !!opts.req.headers.cookie;
  console.log("[Context] createContext called:", {
    path: opts.req.path,
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: typeof authHeader === 'string' ? authHeader.substring(0, 20) : null,
    hasCookie,
  });

  try {
    user = await sdk.authenticateRequest(opts.req);
    console.log("[Context] User authenticated:", user?.id, user?.email);
  } catch (error: any) {
    // Authentication is optional for public procedures.
    console.log("[Context] Authentication failed:", error?.message || error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
