import { XrayClient } from "./xray-client.js";

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
}

const XRAY_CLOUD_AUTH_URL = "https://xray.cloud.getxray.app/api/v2/authenticate";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function authenticate(config: AuthConfig): Promise<string> {
  // Return cached token if still valid (tokens last ~1 hour, refresh 5 min early)
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(XRAY_CLOUD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xray authentication failed (${response.status}): ${errorText}`);
  }

  // The response is a plain JWT token string (quoted)
  const token = (await response.text()).replace(/"/g, "");
  cachedToken = token;
  tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes

  return token;
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}
