import { describe, it, expect, afterEach } from "vitest";
import {
  getGoogleOAuthClientId,
  isGoogleOAuthConfigured,
} from "../../src/main/calendar/auth/google-client-id.js";

describe("google-client-id", () => {
  afterEach(() => {
    delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
  });

  it("returns empty when unset", () => {
    delete process.env["GOOGLE_OAUTH_CLIENT_ID"];
    expect(getGoogleOAuthClientId()).toBe("");
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("trims env value", () => {
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "  client.apps.googleusercontent.com  ";
    expect(getGoogleOAuthClientId()).toBe("client.apps.googleusercontent.com");
    expect(isGoogleOAuthConfigured()).toBe(true);
  });

  it("treats whitespace-only as empty", () => {
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "   ";
    expect(getGoogleOAuthClientId()).toBe("");
    expect(isGoogleOAuthConfigured()).toBe(false);
  });
});
