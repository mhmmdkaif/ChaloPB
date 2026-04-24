/**
 * Decode the payload segment of a JWT without verifying the signature.
 * Returns the parsed payload object or null on failure.
 */
export function decodeJwtPayload(token) {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        return JSON.parse(atob(padded));
    } catch (err) {
        console.error("JWT decode failed:", err);
        return null;
    }
}

/**
 * Check whether a decoded JWT payload has expired.
 * Returns true if expired, false otherwise.
 */
export function isJwtExpired(payload, nowSeconds = Math.floor(Date.now() / 1000)) {
    return Boolean(payload?.exp && payload.exp <= nowSeconds);
}
