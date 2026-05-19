import { XrayAuthError, XrayHttpError } from "../types.js";

/**
 * HTTP client wrapper providing authenticated requests with retry logic.
 *
 * Features:
 * - Automatic retry with exponential backoff for 429 rate limit responses (max 3 retries, 30s cap)
 * - Throws XrayAuthError on 401/403 responses
 * - Throws XrayHttpError on other non-2xx responses
 * - Supports JSON and text response modes
 */
export class HttpClient {
  private readonly maxRetries = 3;
  private readonly maxBackoffMs = 30_000;

  /**
   * Private retry loop — handles 429, 401/403, generic errors.
   * Caller provides the fetch call and response handler.
   */
  private async _retryLoop<T>(
    fetchFn: () => Promise<Response>,
    handleResponse: (res: Response) => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), this.maxBackoffMs);
        await this._sleep(delay);
      }

      const res = await fetchFn();

      // 429: rate limited, retry with backoff
      if (res.status === 429) {
        lastError = new XrayHttpError(
          429,
          `ERR:RATE_LIMITED 429 Too Many Requests (attempt ${attempt + 1}/${this.maxRetries + 1})\n-> Rate limit exceeded, retry after backoff`
        );
        continue;
      }

      // 401/403: auth error (distinct error type)
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        throw new XrayAuthError(`ERR:AUTH_${res.status} ${res.statusText}: ${text}`);
      }

      // Any other error
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new XrayHttpError(res.status, `ERR:HTTP_${res.status} ${res.statusText}: ${text}`);
      }

      return handleResponse(res);
    }

    throw (
      lastError ??
      new XrayHttpError(
        429,
        "ERR:RATE_LIMITED 429 Too Many Requests\n-> Rate limit exceeded after all retries"
      )
    );
  }

  /**
   * Sends an authenticated HTTP request and parses the JSON response.
   */
  async request<T>(
    url: string,
    options: {
      method: string;
      token: string;
      body?: unknown;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    return this._retryLoop(
      () =>
        fetch(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        }),
      (res) => res.json() as Promise<T>
    );
  }

  /**
   * Sends an authenticated HTTP request and returns the raw text response.
   */
  async requestText(
    url: string,
    options: {
      method: string;
      token: string;
      headers?: Record<string, string>;
    }
  ): Promise<string> {
    return this._retryLoop(
      () =>
        fetch(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            ...options.headers,
          },
        }),
      (res) => res.text()
    );
  }

  protected async _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
