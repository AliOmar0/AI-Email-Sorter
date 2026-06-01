// Cross-origin deploy support. When the frontend is served from a different
// origin than the API (e.g. GitHub Pages + Vercel), VITE_API_BASE_URL points at
// the remote backend and the app authenticates with a bearer token stored in
// localStorage. On Replit (same-origin) VITE_API_BASE_URL is unset, so these
// helpers are no-ops and the session cookie is used instead.

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);

const TOKEN_KEY = "inbox-ai-auth-token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Prefixes an API path with the remote backend origin when configured. Used for
// full-page navigations (OAuth redirect) that bypass the fetch client.
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
