import { createContext, useState } from "react";
import { decodeJwtPayload, isJwtExpired } from "../utils/jwt";
import api from "../api/api";

export const AuthContext = createContext();


function parseAuthFromStorage() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || isJwtExpired(payload)) {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return null;
  }

  return {
    token,
    id: payload.id ?? null,
    role: payload.role ?? null,
    email: payload.email ?? null,
    name: payload.name ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => parseAuthFromStorage());

  const login = (data) => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    const token = data?.token;
    if (!token) return logout();

    const payload = decodeJwtPayload(token);
    if (!payload || isJwtExpired(payload)) return logout();

    const nextUser = {
      id: payload.id,
      role: payload.role,
      token,
      email: payload.email ?? data?.email ?? null,
      name: payload.name ?? data?.name ?? null,
    };

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const logout = () => {
    const token = localStorage.getItem("token");
    if (token) {
      // Best-effort server-side invalidation; local logout must still complete.
      api.post("/auth/logout").catch((err) => {
        console.warn("Logout revocation failed:", err?.response?.data?.message || err?.message);
      });
    }
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
