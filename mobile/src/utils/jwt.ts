/**
 * JWT utilities for token parsing and validation
 */

export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );

    return JSON.parse(atob(padded));
  } catch (err) {
    console.error("[JWT] Decode failed:", err);
    return null;
  }
}

/**
 * Check if a JWT payload has expired
 */
export function isJwtExpired(
  payload: Record<string, any>,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return Boolean(payload?.exp && payload.exp <= nowSeconds);
}

/**
 * Parse auth from storage token
 */
export function parseAuthFromToken(token: string) {
  const payload = decodeJwtPayload(token);
  if (!payload || isJwtExpired(payload)) {
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
