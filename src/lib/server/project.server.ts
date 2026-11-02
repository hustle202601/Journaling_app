import { getEnvValue } from "./env.server";
import { loadServiceAccount } from "./serviceAccount.server";

export async function getFirebaseProjectId(env: unknown): Promise<string> {
  const configured = getEnvValue(env, "FIREBASE_PROJECT_ID");
  if (configured) return configured;
  return (await loadServiceAccount(env)).project_id;
}
