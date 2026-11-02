import { ApiError } from "./errors.server";
import { base64UrlDecodeBytes, base64UrlDecodeText } from "./base64url.server";

interface FirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

type Jwk = JsonWebKey & { kid?: string };

let keyCache: { keys: Map<string, Jwk>; expiresAt: number } | null = null;

async function fetchSigningKeys(force = false): Promise<Map<string, Jwk>> {
  if (!force && keyCache && keyCache.expiresAt > Date.now()) return keyCache.keys;

  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) {
    throw new ApiError(502, "Could not verify the sign-in token right now.", "jwks_unavailable");
  }

  const data = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, Jwk>();
  for (const key of data.keys ?? []) {
    if (key.kid) keys.set(key.kid, key);
  }
  if (!keys.size) throw new ApiError(502, "Firebase returned no signing keys.", "jwks_unavailable");

  keyCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<FirebaseUser> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");

  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(base64UrlDecodeText(headerPart)) as { alg?: string; kid?: string };
  } catch {
    throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");
  }

  let keys = await fetchSigningKeys();
  let jwk = keys.get(header.kid);
  if (!jwk) {
    keys = await fetchSigningKeys(true);
    jwk = keys.get(header.kid);
  }
  if (!jwk) throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecodeBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");

  let payload: {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  try {
    payload = JSON.parse(base64UrlDecodeText(payloadPart)) as typeof payload;
  } catch {
    throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(projectId)) {
    throw new ApiError(401, "Sign-in token is for a different Firebase project.", "unauthorized");
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");
  }
  if (!payload.exp || payload.exp <= now) {
    throw new ApiError(401, "Your sign-in has expired. Please sign in again.", "unauthorized");
  }
  if (payload.iat && payload.iat > now + 60) {
    throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");
  }
  if (!payload.sub) throw new ApiError(401, "Missing or invalid sign-in token.", "unauthorized");

  return {
    uid: payload.sub,
    ...(payload.email ? { email: payload.email } : {}),
    emailVerified: payload.email_verified === true,
  };
}
