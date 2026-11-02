import { ApiError } from "./errors.server";
import { base64UrlEncodeBytes, base64UrlEncodeText } from "./base64url.server";
import { loadServiceAccount } from "./serviceAccount.server";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function pemToBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new ApiError(500, "The Firebase service account private key is malformed.", "bad_private_key");
  }
}

async function signJwt(env: unknown): Promise<string> {
  const account = await loadServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

export async function getGoogleAccessToken(env: unknown): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.accessToken;

  const account = await loadServiceAccount(env);
  const assertion = await signJwt(env);
  const response = await fetch(account.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(
      502,
      `Google service account authentication failed (${response.status}). ${detail.slice(0, 300)}`,
      "google_auth_failed",
    );
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new ApiError(502, "Google did not return an access token.", "google_auth_failed");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(300, data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}
