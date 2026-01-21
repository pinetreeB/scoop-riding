import { useAuthContext } from "@/lib/auth-context";

/**
 * Hook to access authentication state and methods.
 * Must be used within AuthProvider.
 */
export function useAuth() {
  return useAuthContext();
}
