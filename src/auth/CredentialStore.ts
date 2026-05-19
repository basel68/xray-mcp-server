import type { AuthContext, CloudCredentials, CredentialMode, XrayRegion } from "../types.js";
import { XrayAuthError } from "../types.js";

/**
 * Resolves Xray Cloud credentials from environment variables or HTTP headers.
 * Supports lazy validation — credentials are only checked when first needed.
 */
export class CredentialStore {
  /**
   * Resolves credentials from environment variables (stdio mode).
   * Throws XrayAuthError with actionable hints if required vars are missing.
   */
  resolveFromEnv(): AuthContext {
    const clientId = process.env.XRAY_CLIENT_ID;
    const clientSecret = process.env.XRAY_CLIENT_SECRET;
    const region = (process.env.XRAY_REGION || "global") as XrayRegion;

    if (!clientId) {
      throw new XrayAuthError(
        "ERR:AUTH_MISSING_CRED No client ID\n-> Set XRAY_CLIENT_ID environment variable"
      );
    }

    if (!clientSecret) {
      throw new XrayAuthError(
        "ERR:AUTH_MISSING_CRED No client secret\n-> Set XRAY_CLIENT_SECRET environment variable"
      );
    }

    return {
      credentials: {
        xrayClientId: clientId,
        xrayClientSecret: clientSecret,
        xrayRegion: region,
      },
      source: "env",
    };
  }

  /**
   * Resolves credentials from HTTP request headers (HTTP mode).
   * Used for per-request credential isolation.
   */
  resolveFromHeaders(headers: { clientId?: string; clientSecret?: string }): AuthContext {
    const { clientId, clientSecret } = headers;
    const region = (process.env.XRAY_REGION || "global") as XrayRegion;

    if (!clientId) {
      throw new XrayAuthError(
        "ERR:AUTH_MISSING_CRED No client ID in request headers\n-> Set X-Xray-Client-Id header"
      );
    }

    if (!clientSecret) {
      throw new XrayAuthError(
        "ERR:AUTH_MISSING_CRED No client secret in request headers\n-> Set X-Xray-Client-Secret header"
      );
    }

    return {
      credentials: { xrayClientId: clientId, xrayClientSecret: clientSecret, xrayRegion: region },
      source: "header",
    };
  }

  /**
   * Returns the configured credential mode from XRAY_CREDENTIAL_MODE env var.
   * Defaults to "strict" if not set.
   */
  getCredentialMode(): CredentialMode {
    const raw = process.env.XRAY_CREDENTIAL_MODE || "strict";

    if (!["strict", "shared-reads", "fully-shared"].includes(raw)) {
      throw new XrayAuthError(
        `ERR:AUTH_INVALID_MODE Invalid credential mode: ${raw}\n-> Use strict, shared-reads, or fully-shared`
      );
    }

    return raw as CredentialMode;
  }
}
