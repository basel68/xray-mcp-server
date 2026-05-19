import type { CloudCredentials, XrayRegion } from "../types.js";
import { XrayAuthError, XrayHttpError } from "../types.js";

/**
 * Helper to resolve regional Xray Cloud endpoints.
 */
function resolveBaseUrl(region: XrayRegion): string {
  switch (region) {
    case "us":
      return "https://us.xray.cloud.getxray.app";
    case "eu":
      return "https://eu.xray.cloud.getxray.app";
    case "au":
      return "https://au.xray.cloud.getxray.app";
    default:
      return "https://xray.cloud.getxray.app";
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Manages JWT authentication with Xray Cloud API.
 * - Caches tokens per client_id with 24h TTL
 * - Deduplicates concurrent authentication requests
 * - Implements exponential backoff retry on 429 rate limit
 *
 * Module-scope singleton so the token cache survives across requests.
 */
export class AuthManager {
  private tokenCache = new Map<string, CachedToken>();
  private inFlight = new Map<string, Promise<string>>();

  private readonly REFRESH_BUFFER_MS = 50 * 60 * 1000; // 50 minutes before expiry
  private readonly MAX_RETRIES = 3;
  private readonly MAX_BACKOFF_MS = 30_000;

  /**
   * Returns a valid JWT for the given credentials.
   * - Returns cached token if still fresh
   * - Deduplicates concurrent calls
   */
  async getCloudToken(creds: CloudCredentials): Promise<string> {
    const key = creds.xrayClientId;

    // Return cached token if still fresh
    const cached = this.tokenCache.get(key);
    if (cached && Date.now() < cached.expiresAt - this.REFRESH_BUFFER_MS) {
      return cached.token;
    }

    // Deduplicate concurrent requests
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Start new auth request
    const promise = this._fetchToken(creds).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Fetches a new token from Xray Cloud with exponential backoff retry.
   */
  private async _fetchToken(creds: CloudCredentials): Promise<string> {
    const baseUrl = resolveBaseUrl(creds.xrayRegion);
    const url = `${baseUrl}/api/v2/authenticate`;

    let attempt = 0;

    while (true) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: creds.xrayClientId,
          client_secret: creds.xrayClientSecret,
        }),
      });

      // Handle 429 rate limit with exponential backoff
      if (response.status === 429) {
        if (attempt >= this.MAX_RETRIES) {
          throw new XrayHttpError(
            429,
            `ERR:RATE_LIMITED Auth rate limit exceeded after ${this.MAX_RETRIES} retries\n-> Rate limit exceeded, retry after 30s`
          );
        }
        const delay = Math.min(1000 * 2 ** attempt, this.MAX_BACKOFF_MS);
        await this._sleep(delay);
        attempt++;
        continue;
      }

      // Handle auth errors
      if (response.status === 401 || response.status === 403) {
        throw new XrayAuthError(
          `ERR:AUTH_FAILED ${response.status}\n-> Check XRAY_CLIENT_ID and XRAY_CLIENT_SECRET are valid`
        );
      }

      // Handle other HTTP errors
      if (!response.ok) {
        throw new XrayHttpError(
          response.status,
          `ERR:HTTP_ERROR ${response.status}\n-> Unexpected error from Xray API`
        );
      }

      // Parse token (Xray returns a JSON-quoted string: "\"jwt-token-here\"")
      const raw = await response.text();
      const token = raw.replace(/"/g, "");

      // Cache with 24h TTL
      this.tokenCache.set(creds.xrayClientId, {
        token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });

      return token;
    }
  }

  private async _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Module-scope singleton — cache survives request boundaries in both stdio and HTTP modes.
 */
export const authManager = new AuthManager();
