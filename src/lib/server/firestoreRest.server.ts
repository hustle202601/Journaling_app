import { ApiError } from "./errors.server";
import { getGoogleAccessToken } from "./googleAccessToken.server";
import { getFirebaseProjectId } from "./project.server";

interface FireValue {
  nullValue?: null;
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  arrayValue?: { values?: FireValue[] };
  mapValue?: { fields?: Record<string, FireValue> };
  referenceValue?: string;
  [key: string]: unknown;
}

export interface FirestoreData {
  userId?: string;
  source?: string;
  id?: string;
  accountId?: string;
  positionId?: string;
  dealId?: string;
  symbol?: string;
  side?: string;
  volume?: number;
  openTime?: string;
  closeTime?: string;
  openPrice?: number;
  closePrice?: number;
  sl?: number | null;
  tp?: number | null;
  commission?: number;
  swap?: number;
  profit?: number;
  closeReason?: string;
  comment?: string;
  magic?: number;
  label?: string;
  status?: string;
  tokenLast4?: string | null;
  createdAt?: number;
  updatedAt?: number;
  rotatedAt?: number;
  disconnectedAt?: number;
  login?: string;
  server?: string;
  broker?: string;
  accountName?: string;
  currency?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  tradeAllowed?: boolean;
  terminalBuild?: number;
  lastSyncAt?: number;
  lastHeartbeatAt?: number;
  syncRequestedAt?: number;
  lastError?: string | null;
  lastErrorAt?: number | null;
  lastRequestId?: string;
  lastUsedAt?: number;
  ticket?: string;
  closedTrades?: number;
  openPositions?: number;
  requestId?: string | null;
  finishedAt?: number;
  [key: string]: unknown;
}

export interface FirestoreDocument {
  id: string;
  name: string;
  updateTime?: string;
  data: FirestoreData;
}

export interface QueryOptions {
  where?: { field: string; op?: "EQUAL" | "NOT_EQUAL" | "LESS_THAN" | "GREATER_THAN"; value: unknown };
  orderBy?: { field: string; direction?: "ASCENDING" | "DESCENDING" };
  limit?: number;
}

export function toFireValue(value: unknown): FireValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFireValue(item)).filter((item): item is FireValue => item !== undefined),
      },
    };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value as FirestoreData) } };
  }
  return { stringValue: String(value) };
}

export function encodeFields(data: FirestoreData): Record<string, FireValue> {
  const fields: Record<string, FireValue> = {};
  for (const [key, value] of Object.entries(data)) {
    const encoded = toFireValue(value);
    if (encoded !== undefined) fields[key] = encoded;
  }
  return fields;
}

function fromFireValue(value: FireValue): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const array = value.arrayValue as { values?: FireValue[] } | undefined;
    return (array?.values ?? []).map(fromFireValue);
  }
  if ("mapValue" in value) {
    const map = value.mapValue as { fields?: Record<string, FireValue> } | undefined;
    return decodeFields(map?.fields ?? {});
  }
  if ("referenceValue" in value) return value.referenceValue;
  return null;
}

export function decodeFields(fields: Record<string, FireValue>): FirestoreData {
  const data: FirestoreData = {};
  for (const [key, value] of Object.entries(fields)) data[key] = fromFireValue(value);
  return data;
}

function lastPathSegment(name: string): string {
  const raw = name.split("/").pop() ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function firestoreFetch(env: unknown, suffix: string, init?: RequestInit): Promise<Response> {
  const projectId = await getFirebaseProjectId(env);
  const accessToken = await getGoogleAccessToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const response = await fetch(`${base}${suffix}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

async function errorFromResponse(response: Response, action: string): Promise<ApiError> {
  const body = await response.text().catch(() => "");
  return new ApiError(
    response.status >= 500 ? 502 : 500,
    `Firestore ${action} failed (${response.status}). ${body.slice(0, 300)}`,
    "firestore_error",
  );
}

export async function getDocument(env: unknown, path: string): Promise<FirestoreDocument | null> {
  const response = await firestoreFetch(env, `/${path.replace(/^\//, "")}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw await errorFromResponse(response, "read");

  const document = (await response.json()) as {
    name: string;
    updateTime?: string;
    fields?: Record<string, FireValue>;
  };
  return {
    id: lastPathSegment(document.name),
    name: document.name,
    ...(document.updateTime ? { updateTime: document.updateTime } : {}),
    data: decodeFields(document.fields ?? {}),
  };
}

export async function patchDocument(
  env: unknown,
  path: string,
  data: FirestoreData,
  updateMask?: string[],
): Promise<void> {
  const query = updateMask?.length
    ? `?${updateMask.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`
    : "";
  const response = await firestoreFetch(env, `/${path.replace(/^\//, "")}${query}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!response.ok) throw await errorFromResponse(response, "write");
}

function documentName(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path.replace(/^\//, "")}`;
}

export async function commitChanges(
  env: unknown,
  updates: { path: string; data: FirestoreData }[],
  deletes: string[] = [],
): Promise<void> {
  if (!updates.length && !deletes.length) return;
  const projectId = await getFirebaseProjectId(env);
  const writes = [
    ...updates.map((entry) => ({
      update: {
        name: documentName(projectId, entry.path),
        fields: encodeFields(entry.data),
      },
    })),
    ...deletes.map((path) => ({ delete: documentName(projectId, path) })),
  ];

  for (let offset = 0; offset < writes.length; offset += 400) {
    const response = await firestoreFetch(env, ":commit", {
      method: "POST",
      body: JSON.stringify({ writes: writes.slice(offset, offset + 400) }),
    });
    if (!response.ok) throw await errorFromResponse(response, "commit");
  }
}

export async function runQuery(
  env: unknown,
  collectionId: string,
  options: QueryOptions = {},
): Promise<FirestoreDocument[]> {
  const structuredQuery: {
    from: { collectionId: string }[];
    limit: number;
    where?: unknown;
    orderBy?: unknown[];
  } = {
    from: [{ collectionId }],
    limit: options.limit ?? 1000,
  };
  if (options.where) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: options.where.field },
        op: options.where.op ?? "EQUAL",
        value: toFireValue(options.where.value),
      },
    };
  }
  if (options.orderBy) {
    structuredQuery.orderBy = [
      {
        field: { fieldPath: options.orderBy.field },
        direction: options.orderBy.direction ?? "ASCENDING",
      },
    ];
  }

  const response = await firestoreFetch(env, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
  });
  if (!response.ok) throw await errorFromResponse(response, "query");

  const rows = (await response.json()) as Array<{
    document?: { name: string; updateTime?: string; fields?: Record<string, FireValue> };
  }>;
  return rows
    .filter((row) => Boolean(row.document))
    .map((row) => {
      const document = row.document!;
      return {
        id: lastPathSegment(document.name),
        name: document.name,
        ...(document.updateTime ? { updateTime: document.updateTime } : {}),
        data: decodeFields(document.fields ?? {}),
      };
    });
}
