/**
 * Google Desktop OAuth PKCE with loopback redirect.
 * Bind 127.0.0.1 only; 5 minute timeout; single in-flight flow.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { shell } from "electron";
import { URL } from "node:url";

import { getGoogleOAuthClientId, isGoogleOAuthConfigured } from "./google-client-id.js";
import {
  clearGoogleTokens,
  loadGoogleTokens,
  saveGoogleTokens,
  type GoogleTokenFileV1,
} from "./google-token-store.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"] as const;

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const PROACTIVE_REFRESH_MS = 60_000;

let refreshInFlight: Promise<GoogleTokenFileV1 | null> | null = null;
let oauthInFlight: Promise<"granted" | "denied" | "not-determined"> | null = null;

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function generateVerifier(): string {
  return base64Url(randomBytes(32));
}

function generateChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  return base64Url(randomBytes(16));
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee}
.card{max-width:28rem;padding:2rem;border-radius:12px;background:#1c1c1e;text-align:center}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
}): Promise<GoogleTokenFileV1> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json["error_description"] === "string"
        ? json["error_description"]
        : `Token exchange failed (${res.status})`,
    );
  }

  const accessToken = json["access_token"];
  const refreshToken = json["refresh_token"];
  const expiresIn = json["expires_in"];
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new Error("Token response missing access_token or refresh_token");
  }
  const expiryMs = Date.now() + (typeof expiresIn === "number" ? expiresIn * 1000 : 3600 * 1000);

  let email: string | undefined;
  try {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as Record<string, unknown>;
      if (typeof user["email"] === "string") email = user["email"];
    }
  } catch {
    // email is optional
  }

  const scope = typeof json["scope"] === "string" ? json["scope"] : SCOPES.join(" ");
  return {
    authSchemaVersion: 1,
    clientId: params.clientId,
    accessToken,
    refreshToken,
    expiryMs,
    ...(email !== undefined ? { email } : {}),
    scope,
  };
}

async function refreshWithToken(tokens: GoogleTokenFileV1): Promise<GoogleTokenFileV1> {
  const clientId = getGoogleOAuthClientId();
  if (clientId.length === 0) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json["error_description"] === "string"
        ? json["error_description"]
        : `Token refresh failed (${res.status})`,
    );
  }

  const accessToken = json["access_token"];
  const expiresIn = json["expires_in"];
  if (typeof accessToken !== "string") {
    throw new Error("Refresh response missing access_token");
  }

  const next: GoogleTokenFileV1 = {
    ...tokens,
    clientId,
    accessToken,
    expiryMs: Date.now() + (typeof expiresIn === "number" ? expiresIn * 1000 : 3600 * 1000),
    // Google may omit refresh_token on refresh — keep existing
    refreshToken:
      typeof json["refresh_token"] === "string" ? json["refresh_token"] : tokens.refreshToken,
  };
  await saveGoogleTokens(next);
  return next;
}

/** Single-flight token refresh; clears tokens permanently on hard failure. */
export async function ensureFreshGoogleAccessToken(): Promise<GoogleTokenFileV1 | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const tokens = await loadGoogleTokens();
    if (tokens === null) return null;

    if (tokens.expiryMs - Date.now() > PROACTIVE_REFRESH_MS) {
      return tokens;
    }

    try {
      return await refreshWithToken(tokens);
    } catch (err) {
      console.warn("[calendar:auth] Refresh failed; clearing tokens:", err);
      await clearGoogleTokens();
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Run interactive PKCE OAuth in the system browser.
 * Returns granted/denied/not-determined; coalesces concurrent calls.
 */
export async function runGooglePkceLogin(): Promise<"granted" | "denied" | "not-determined"> {
  if (oauthInFlight) return oauthInFlight;

  oauthInFlight = (async () => {
    if (!isGoogleOAuthConfigured()) {
      console.error("[calendar:auth] GOOGLE_OAUTH_CLIENT_ID is not set");
      return "denied";
    }

    const clientId = getGoogleOAuthClientId();
    const codeVerifier = generateVerifier();
    const codeChallenge = generateChallenge(codeVerifier);
    const state = generateState();

    let server: Server | null = null;
    let settled = false;

    const result = await new Promise<"granted" | "denied" | "not-determined">((resolve) => {
      const finish = (value: "granted" | "denied" | "not-determined"): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (server) {
          server.close();
          server = null;
        }
        resolve(value);
      };

      const timer = setTimeout(() => {
        console.warn("[calendar:auth] OAuth timed out");
        finish("not-determined");
      }, OAUTH_TIMEOUT_MS);

      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          try {
            if (!req.url) {
              res.writeHead(400);
              res.end("Bad request");
              return;
            }
            const url = new URL(req.url, "http://127.0.0.1");
            if (url.pathname !== "/oauth/callback") {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            const errParam = url.searchParams.get("error");
            if (errParam) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(
                htmlPage(
                  "Authorization cancelled",
                  "You can close this window and return to GogMeet.",
                ),
              );
              finish("denied");
              return;
            }

            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");
            if (!code || returnedState !== state) {
              res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
              res.end(htmlPage("Invalid response", "State mismatch or missing code."));
              finish("denied");
              return;
            }

            const addr = server?.address();
            if (!addr || typeof addr === "string") {
              finish("denied");
              return;
            }
            const redirectUri = `http://127.0.0.1:${addr.port}/oauth/callback`;

            try {
              const tokens = await exchangeCode({
                code,
                redirectUri,
                codeVerifier,
                clientId,
              });
              await saveGoogleTokens(tokens);
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(
                htmlPage(
                  "Connected",
                  "Google Calendar is connected. You can close this window and return to GogMeet.",
                ),
              );
              finish("granted");
            } catch (exchangeErr) {
              console.error("[calendar:auth] Token exchange failed:", exchangeErr);
              res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
              res.end(
                htmlPage(
                  "Connection failed",
                  "Could not complete sign-in. Return to GogMeet and try again.",
                ),
              );
              finish("denied");
            }
          } catch (handlerErr) {
            console.error("[calendar:auth] Callback handler error:", handlerErr);
            try {
              res.writeHead(500);
              res.end("Error");
            } catch {
              // ignore
            }
            finish("denied");
          }
        })();
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server?.address();
        if (!addr || typeof addr === "string") {
          finish("denied");
          return;
        }
        const redirectUri = `http://127.0.0.1:${addr.port}/oauth/callback`;
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", SCOPES.join(" "));
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);

        void shell.openExternal(authUrl.toString()).catch((openErr: unknown) => {
          console.error("[calendar:auth] Failed to open browser:", openErr);
          finish("denied");
        });
      });

      server.on("error", (listenErr) => {
        console.error("[calendar:auth] Loopback server error:", listenErr);
        finish("denied");
      });
    });

    return result;
  })().finally(() => {
    oauthInFlight = null;
  });

  return oauthInFlight;
}

/** Whether an OAuth browser flow is currently running. */
export function isGoogleOAuthInFlight(): boolean {
  return oauthInFlight !== null;
}
