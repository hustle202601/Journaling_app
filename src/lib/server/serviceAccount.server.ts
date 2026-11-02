import { ApiError } from "./errors.server";
import { getEnvValue } from "./env.server";

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cached: ServiceAccount | null = null;

export async function loadServiceAccount(env: unknown): Promise<ServiceAccount> {
  if (cached) return cached;

  const base64 = getEnvValue(env, "FIREBASE_SERVICE_ACCOUNT_BASE64");
  const json = getEnvValue(env, "FIREBASE_SERVICE_ACCOUNT_JSON");
  let raw: string | undefined;

  if (json) {
    raw = json;
  } else if (base64) {
    try {
      const binary = atob(base64.replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      raw = new TextDecoder().decode(bytes);
    } catch {
      throw new ApiError(500, "The Firebase service account secret is not valid base64.", "bad_service_account");
    }
  }

  if (!raw) {
    throw new ApiError(
      500,
      "Missing FIREBASE_SERVICE_ACCOUNT_BASE64. Add the Firebase service account JSON as a server environment secret.",
      "missing_service_account",
    );
  }

  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new ApiError(500, "The Firebase service account secret is not valid JSON.", "bad_service_account");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new ApiError(500, "The Firebase service account is missing required fields.", "bad_service_account");
  }

  cached = {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
    token_uri: parsed.token_uri ?? "https://oauth2.googleapis.com/token",
  };
  return cached;
}
