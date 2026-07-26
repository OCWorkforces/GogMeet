/**
 * Resolve the Google Desktop OAuth client ID (K28).
 * Build/package injects GOOGLE_OAUTH_CLIENT_ID; empty means OAuth unavailable.
 */

export function getGoogleOAuthClientId(): string {
  const fromEnv = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return "";
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthClientId().length > 0;
}
