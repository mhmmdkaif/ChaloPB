/**
 * Auth Context - Manages user authentication state
 */

import React, { createContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApi } from "../services/api";
import { parseAuthFromToken, decodeJwtPayload, isJwtExpired } from "../utils/jwt";
import { initializeSocket, disconnectSocket } from "../socket/socket";

export interface AuthUser {
  id: number;
  role: "user" | "driver" | "admin";
  email: string;
  name: string;
  token: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  socketConnected: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    password: string;
    name: string;
    role?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  restoreToken: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  /**
   * Initialize socket when we have a valid token
   */
  useEffect(() => {
    if (user?.token) {
      initializeSocket(
        user.token,
        () => setSocketConnected(true),
        () => setSocketConnected(false),
        (err) => {
          console.warn("[Socket] Error:", err);
          setSocketConnected(false);
        }
      );
    } else {
      // No user — tear down socket
      disconnectSocket();
      setSocketConnected(false);
    }
  }, [user?.token]);

  /**
   * Restore token from storage on app launch
   */
  const restoreToken = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await AsyncStorage.getItem("auth_token");
      if (!token) {
        setUser(null);
        return;
      }

      const auth = parseAuthFromToken(token);
      if (!auth) {
        // Token invalid or expired
        await AsyncStorage.removeItem("auth_token");
        await AsyncStorage.removeItem("auth_user");
        setUser(null);
        return;
      }

      setUser(auth as AuthUser);
    } catch (err) {
      console.error("[Auth] Restore token failed:", err);
      setError(err instanceof Error ? err.message : "Failed to restore token");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Login user
   */
  const login = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true);
        setError(null);

        const api = getApi();
        const res = await api.post("/auth/login", { email, password });

        const token = res.data?.token;
        if (!token) {
          throw new Error("No token in response");
        }

        const auth = parseAuthFromToken(token);
        if (!auth) {
          throw new Error("Invalid token");
        }

        // Store token and user
        await AsyncStorage.setItem("auth_token", token);
        await AsyncStorage.setItem("auth_user", JSON.stringify(auth));

        setUser(auth as AuthUser);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Login failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Signup user
   */
  const signup = useCallback(
    async (data: {
      email: string;
      password: string;
      name: string;
      role?: string;
    }) => {
      try {
        setLoading(true);
        setError(null);
        const api = getApi();
        await api.post("/auth/register", data);

        // Backend does not return a token on register — perform login to obtain token
        await login(data.email, data.password);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Signup failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [login]
  );

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      setLoading(true);
      const api = getApi();

      // Best-effort server-side logout
      try {
        await api.post("/auth/logout");
      } catch (err) {
        console.warn("[Auth] Server logout failed:", err);
      }

      // Clear storage
      await AsyncStorage.removeItem("auth_token");
      await AsyncStorage.removeItem("auth_user");

      setUser(null);
      setError(null);
    } catch (err) {
      console.error("[Auth] Logout failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore token on app launch
  useEffect(() => {
    restoreToken();
  }, [restoreToken]);

  const value: AuthContextType = {
    user,
    loading,
    error,
    socketConnected,
    login,
    signup,
    logout,
    restoreToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
