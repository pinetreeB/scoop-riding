import React, { createContext, useContext, useCallback, useEffect, useState, useMemo } from "react";
import { Platform } from "react-native";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

interface AuthContextType {
  user: Auth.User | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  login: (user: Auth.User, token?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    console.log("[AuthContext] fetchUser called");
    try {
      setLoading(true);
      setError(null);

      // First check for cached user info
      const cachedUser = await Auth.getUserInfo();
      console.log("[AuthContext] Cached user:", cachedUser);

      if (cachedUser) {
        console.log("[AuthContext] Using cached user info");
        setUser(cachedUser);
        setLoading(false);
        return;
      }

      // Web platform: try to fetch from API if no cached user
      if (Platform.OS === "web") {
        console.log("[AuthContext] Web platform: fetching user from API...");
        try {
          const apiUser = await Api.getMe();
          console.log("[AuthContext] API user response:", apiUser);

          if (apiUser) {
            const userInfo: Auth.User = {
              id: apiUser.id,
              openId: apiUser.openId,
              name: apiUser.name,
              email: apiUser.email,
              loginMethod: apiUser.loginMethod,
              lastSignedIn: new Date(apiUser.lastSignedIn),
            };
            setUser(userInfo);
            await Auth.setUserInfo(userInfo);
            console.log("[AuthContext] Web user set from API:", userInfo);
          } else {
            console.log("[AuthContext] Web: No authenticated user from API");
            setUser(null);
          }
        } catch (apiError) {
          console.log("[AuthContext] API call failed, user not authenticated:", apiError);
          setUser(null);
        }
        return;
      }

      // Native platform: use token-based auth
      console.log("[AuthContext] Native platform: checking for session token...");
      const sessionToken = await Auth.getSessionToken();
      if (!sessionToken) {
        console.log("[AuthContext] No session token, setting user to null");
        setUser(null);
        return;
      }

      console.log("[AuthContext] Has token but no cached user, setting user to null");
      setUser(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch user");
      console.error("[AuthContext] fetchUser error:", error);
      setError(error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (userInfo: Auth.User, token?: string) => {
    console.log("[AuthContext] login called with user:", userInfo.email);
    
    // Store session token for native
    if (token && Platform.OS !== "web") {
      await Auth.setSessionToken(token);
    }

    // Store user info
    await Auth.setUserInfo(userInfo);
    
    // Update state immediately
    setUser(userInfo);
    setError(null);
    
    console.log("[AuthContext] User logged in successfully");
  }, []);

  const logout = useCallback(async () => {
    console.log("[AuthContext] logout called");
    try {
      await Api.logout();
      console.log("[AuthContext] API logout successful");
    } catch (err) {
      console.error("[AuthContext] Logout API call failed:", err);
    }
    
    // Clear local state and storage
    await Auth.removeSessionToken();
    await Auth.clearUserInfo();
    
    // Update state immediately
    setUser(null);
    setError(null);
    
    console.log("[AuthContext] Local state cleared");
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    console.log("[AuthContext] State updated:", {
      hasUser: !!user,
      loading,
      isAuthenticated,
      error: error?.message,
    });
  }, [user, loading, isAuthenticated, error]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    refresh: fetchUser,
    refreshUser: fetchUser,
  }), [user, loading, error, isAuthenticated, login, logout, fetchUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
