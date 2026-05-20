/**
 * General utility functions
 */

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInitials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return "PS";
  const parts = nameOrEmail.split(/[@.\s]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "PS"
  );
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function getFirstName(displayName: string | null | undefined): string | null {
  if (!displayName || displayName === "Passenger") return null;
  return displayName.split(" ")[0];
}

/**
 * Location utilities
 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Format time utilities
 */
export function formatTime(date: Date | number): string {
  const d = new Date(date);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function isSignificantMove(
  prev: { lat: number; lng: number },
  next: { lat: number; lng: number },
  threshold = 0.00005
): boolean {
  const dx = prev.lat - next.lat;
  const dy = prev.lng - next.lng;
  return Math.sqrt(dx * dx + dy * dy) > threshold;
}
