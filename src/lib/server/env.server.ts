export function getEnvValue(env: unknown, name: string): string | undefined {
  const fromWorker = (env as Record<string, unknown> | null | undefined)?.[name];
  if (typeof fromWorker === "string" && fromWorker.length > 0) return fromWorker;

  const processLike = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const fromProcess = processLike.process?.env?.[name];
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;

  return undefined;
}
