import { z } from "zod";
import { ApiError } from "./errors.server";
import { base64UrlEncodeBytes } from "./base64url.server";
import { getFirebaseProjectId } from "./project.server";
import { verifyFirebaseIdToken } from "./firebaseIdToken.server";
import {
  commitChanges,
  getDocument,
  patchDocument,
  runQuery,
  type FirestoreData,
} from "./firestoreRest.server";

const MAX_WEB_BODY = 16 * 1024;
const MAX_SYNC_BODY = 5 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError(401, "Missing bearer token.", "unauthorized");
  return match[1].trim();
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "Request body is too large.", "payload_too_large");

  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > maxBytes) throw new ApiError(413, "Request body is too large.", "payload_too_large");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `mt5_${base64UrlEncodeBytes(bytes)}`;
}

function randomId(): string {
  return crypto.randomUUID();
}

function documentPath(collectionName: string, id: string): string {
  return `${collectionName}/${encodeURIComponent(id)}`;
}

async function requireUser(request: Request, env: unknown) {
  const token = bearerToken(request);
  const projectId = await getFirebaseProjectId(env);
  return verifyFirebaseIdToken(token, projectId);
}

async function getOwnedAccount(env: unknown, userId: string, accountId: string) {
  const document = await getDocument(env, documentPath("mt5Accounts", accountId));
  if (!document || document.data.userId !== userId) {
    throw new ApiError(404, "MT5 connection not found.", "account_not_found");
  }
  return document;
}

async function deleteDocuments(env: unknown, docs: { id: string }[], collectionName: string) {
  if (!docs.length) return;
  await commitChanges(
    env,
    [],
    docs.map((doc) => documentPath(collectionName, doc.id)),
  );
}

async function deleteTokensForAccount(env: unknown, accountId: string) {
  const tokens = await runQuery(env, "mt5ConnectionTokens", {
    where: { field: "accountId", value: accountId },
    limit: 100,
  });
  await deleteDocuments(env, tokens, "mt5ConnectionTokens");
}

async function deleteOpenPositionsForAccount(env: unknown, accountId: string) {
  const positions = await runQuery(env, "mt5OpenPositions", {
    where: { field: "accountId", value: accountId },
    limit: 5000,
  });
  await deleteDocuments(env, positions, "mt5OpenPositions");
}

async function createTokenDocument(
  env: unknown,
  userId: string,
  accountId: string,
  token: string,
  now: number,
) {
  const hash = await sha256Hex(token);
  await patchDocument(
    env,
    documentPath("mt5ConnectionTokens", hash),
    {
      userId,
      accountId,
      status: "active",
      createdAt: now,
      lastUsedAt: 0,
    },
    ["userId", "accountId", "status", "createdAt", "lastUsedAt"],
  );
  return hash;
}

const connectionBodySchema = z
  .object({
    label: z.string().trim().max(60).optional(),
  })
  .default({});

async function createConnection(request: Request, env: unknown): Promise<Response> {
  const user = await requireUser(request, env);
  const parsed = connectionBodySchema.safeParse(await readJson(request, MAX_WEB_BODY));
  if (!parsed.success) throw new ApiError(400, "Invalid connection details.", "invalid_body");

  const accountId = randomId();
  const token = makeToken();
  const now = Date.now();
  const label = parsed.data.label?.trim() || "MetaTrader 5";

  await patchDocument(
    env,
    documentPath("mt5Accounts", accountId),
    {
      userId: user.uid,
      label,
      status: "pending",
      tokenLast4: token.slice(-4),
      createdAt: now,
      updatedAt: now,
    },
    ["userId", "label", "status", "tokenLast4", "createdAt", "updatedAt"],
  );
  await createTokenDocument(env, user.uid, accountId, token, now);

  return json({
    ok: true,
    account: { id: accountId, label, status: "pending", tokenLast4: token.slice(-4), createdAt: now },
    token,
  });
}

async function rotateConnection(
  request: Request,
  env: unknown,
  accountId: string,
): Promise<Response> {
  const user = await requireUser(request, env);
  await getOwnedAccount(env, user.uid, accountId);

  const parsed = connectionBodySchema.safeParse(await readJson(request, MAX_WEB_BODY));
  if (!parsed.success) throw new ApiError(400, "Invalid connection details.", "invalid_body");

  const token = makeToken();
  const now = Date.now();
  const update: FirestoreData = {
    status: "pending",
    tokenLast4: token.slice(-4),
    updatedAt: now,
    rotatedAt: now,
  };
  if (parsed.data.label !== undefined) update.label = parsed.data.label.trim() || "MetaTrader 5";

  await deleteTokensForAccount(env, accountId);
  await patchDocument(env, documentPath("mt5Accounts", accountId), update, Object.keys(update));
  await createTokenDocument(env, user.uid, accountId, token, now);

  return json({
    ok: true,
    account: { id: accountId, status: "pending", tokenLast4: token.slice(-4) },
    token,
  });
}

async function disconnectConnection(env: unknown, request: Request, accountId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await getOwnedAccount(env, user.uid, accountId);

  const now = Date.now();
  await deleteTokensForAccount(env, accountId);
  await deleteOpenPositionsForAccount(env, accountId);
  await patchDocument(
    env,
    documentPath("mt5Accounts", accountId),
    {
      status: "disconnected",
      tokenLast4: null,
      disconnectedAt: now,
      updatedAt: now,
    },
    ["status", "tokenLast4", "disconnectedAt", "updatedAt"],
  );

  return json({ ok: true, account: { id: accountId, status: "disconnected" } });
}

async function requestSync(env: unknown, request: Request, accountId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await getOwnedAccount(env, user.uid, accountId);
  const now = Date.now();
  await patchDocument(
    env,
    documentPath("mt5Accounts", accountId),
    { syncRequestedAt: now, updatedAt: now },
    ["syncRequestedAt", "updatedAt"],
  );
  return json({ ok: true, requestedAt: now });
}

const sideSchema = z.enum(["buy", "sell"]);
const dateString = z.string().min(10).max(64).refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid date",
});
const idValue = z.union([z.string().min(1).max(64), z.number().finite()]).transform(String);
const finiteNumber = z.number().finite();
const optionalNumber = finiteNumber.optional();

const accountSchema = z.object({
  login: idValue,
  server: z.string().trim().min(1).max(128),
  name: z.string().max(128).optional(),
  company: z.string().max(128).optional(),
  currency: z.string().max(16).optional(),
  balance: finiteNumber,
  equity: finiteNumber,
  margin: optionalNumber,
  freeMargin: optionalNumber,
  leverage: optionalNumber,
  tradeAllowed: z.boolean().optional(),
  terminalBuild: optionalNumber,
});

const openPositionSchema = z.object({
  ticket: idValue,
  symbol: z.string().min(1).max(64),
  type: sideSchema,
  volume: finiteNumber.nonnegative(),
  openTime: dateString,
  openPrice: finiteNumber,
  sl: z.number().finite().nullable().optional(),
  tp: z.number().finite().nullable().optional(),
  profit: finiteNumber,
  swap: finiteNumber,
  commission: finiteNumber,
  comment: z.string().max(256).optional(),
});

const closedTradeSchema = z.object({
  dealId: idValue,
  positionId: idValue,
  symbol: z.string().min(1).max(64),
  type: sideSchema,
  volume: finiteNumber.nonnegative(),
  openTime: dateString,
  closeTime: dateString,
  openPrice: finiteNumber,
  closePrice: finiteNumber,
  sl: z.number().finite().nullable().optional(),
  tp: z.number().finite().nullable().optional(),
  commission: finiteNumber,
  swap: finiteNumber,
  profit: finiteNumber,
  closeReason: z.string().max(64).optional(),
  comment: z.string().max(256).optional(),
  magic: optionalNumber,
});

const syncPayloadSchema = z.object({
  version: optionalNumber,
  account: accountSchema,
  openPositions: z.array(openPositionSchema).max(5000).default([]),
  closedTrades: z.array(closedTradeSchema).max(10000).default([]),
  sync: z
    .object({
      requestId: z.string().max(64).optional(),
      from: z.string().max(64).optional(),
      to: z.string().max(64).optional(),
      historyDays: optionalNumber,
    })
    .optional(),
});

type SyncPayload = z.infer<typeof syncPayloadSchema>;

function parseSyncPayload(body: unknown): SyncPayload {
  const parsed = syncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new ApiError(400, `Invalid sync payload. ${details}`, "invalid_payload");
  }
  return parsed.data;
}

async function syncTrades(request: Request, env: unknown): Promise<Response> {
  const token = bearerToken(request);
  const tokenHash = await sha256Hex(token);
  const tokenDocument = await getDocument(env, documentPath("mt5ConnectionTokens", tokenHash));
  if (!tokenDocument || tokenDocument.data.status !== "active") {
    throw new ApiError(401, "Connection token is invalid or has been revoked.", "unauthorized");
  }

  const accountId = asString(tokenDocument.data.accountId);
  const tokenUserId = asString(tokenDocument.data.userId);
  if (!accountId || !tokenUserId) {
    throw new ApiError(401, "Connection token is invalid.", "unauthorized");
  }

  const accountDocument = await getDocument(env, documentPath("mt5Accounts", accountId));
  if (!accountDocument) throw new ApiError(401, "Connection no longer exists.", "unauthorized");
  if (accountDocument.data.userId !== tokenUserId) {
    throw new ApiError(401, "Connection token is invalid.", "unauthorized");
  }
  if (accountDocument.data.status === "disconnected") {
    throw new ApiError(401, "Connection has been disconnected.", "unauthorized");
  }

  const payload = parseSyncPayload(await readJson(request, MAX_SYNC_BODY));
  const incomingLogin = payload.account.login;
  const incomingServer = payload.account.server;

  const accountLogin = asString(accountDocument.data.login) ?? asString(tokenDocument.data.login);
  const accountServer = asString(accountDocument.data.server) ?? asString(tokenDocument.data.server);
  if (accountLogin && accountLogin !== incomingLogin) {
    throw new ApiError(403, "This token belongs to a different MT5 account.", "account_mismatch");
  }
  if (accountServer && accountServer !== incomingServer) {
    throw new ApiError(403, "This token belongs to a different MT5 server.", "server_mismatch");
  }

  const now = Date.now();
  const requestSync = typeof accountDocument.data.syncRequestedAt === "number"
    ? accountDocument.data.syncRequestedAt > 0
    : false;

  try {
    const accountUpdate: FirestoreData = {
      login: incomingLogin,
      server: incomingServer,
      balance: payload.account.balance,
      equity: payload.account.equity,
      status: "connected",
      lastSyncAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
      syncRequestedAt: 0,
      lastError: null,
      lastErrorAt: null,
    };
    if (payload.account.company) accountUpdate.broker = payload.account.company;
    if (payload.account.name) accountUpdate.accountName = payload.account.name;
    if (payload.account.currency) accountUpdate.currency = payload.account.currency;
    if (payload.account.margin !== undefined) accountUpdate.margin = payload.account.margin;
    if (payload.account.freeMargin !== undefined) accountUpdate.freeMargin = payload.account.freeMargin;
    if (payload.account.leverage !== undefined) accountUpdate.leverage = payload.account.leverage;
    if (payload.account.tradeAllowed !== undefined) accountUpdate.tradeAllowed = payload.account.tradeAllowed;
    if (payload.account.terminalBuild !== undefined) accountUpdate.terminalBuild = payload.account.terminalBuild;
    if (payload.sync?.requestId) accountUpdate.lastRequestId = payload.sync.requestId;

    await patchDocument(
      env,
      documentPath("mt5Accounts", accountId),
      accountUpdate,
      Object.keys(accountUpdate),
    );
    await patchDocument(
      env,
      documentPath("mt5ConnectionTokens", tokenHash),
      { lastUsedAt: now, login: incomingLogin, server: incomingServer },
      ["lastUsedAt", "login", "server"],
    );

    const updates: { path: string; data: FirestoreData }[] = [];
    const seenTrades = new Set<string>();
    for (const trade of payload.closedTrades) {
      if (seenTrades.has(trade.dealId)) continue;
      seenTrades.add(trade.dealId);
      const tradeId = `${accountId}_${trade.dealId}`;
      const data: FirestoreData = {
        userId: tokenUserId,
        source: "mt5",
        id: tradeId,
        accountId,
        positionId: trade.positionId,
        dealId: trade.dealId,
        symbol: trade.symbol,
        side: trade.type,
        volume: trade.volume,
        openTime: trade.openTime,
        closeTime: trade.closeTime,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        sl: trade.sl ?? null,
        tp: trade.tp ?? null,
        commission: trade.commission,
        swap: trade.swap,
        profit: trade.profit,
        updatedAt: now,
        syncedAt: now,
      };
      if (trade.closeReason) data.closeReason = trade.closeReason;
      if (trade.comment) data.comment = trade.comment;
      if (trade.magic !== undefined) data.magic = trade.magic;
      updates.push({ path: documentPath("trades", `mt5_${tradeId}`), data });
    }

    const existingPositions = await runQuery(env, "mt5OpenPositions", {
      where: { field: "accountId", value: accountId },
      limit: 5000,
    });
    const openByTicket = new Map<string, (typeof payload.openPositions)[number]>();
    for (const position of payload.openPositions) openByTicket.set(position.ticket, position);

    const deletes: string[] = [];
    for (const existing of existingPositions) {
      const ticket = asString(existing.data.ticket);
      if (!ticket || !openByTicket.has(ticket)) deletes.push(documentPath("mt5OpenPositions", existing.id));
    }

    for (const position of openByTicket.values()) {
      const data: FirestoreData = {
        userId: tokenUserId,
        accountId,
        ticket: position.ticket,
        symbol: position.symbol,
        side: position.type,
        volume: position.volume,
        openTime: position.openTime,
        openPrice: position.openPrice,
        sl: position.sl ?? null,
        tp: position.tp ?? null,
        profit: position.profit,
        swap: position.swap,
        commission: position.commission,
        updatedAt: now,
      };
      if (position.comment) data.comment = position.comment;
      updates.push({
        path: documentPath("mt5OpenPositions", `open_${accountId}_${position.ticket}`),
        data,
      });
    }

    await commitChanges(env, updates, deletes);

    // Propagate the synced MT5 balance to the user profile so Analytics and
    // other pages use the real account balance as the starting balance.
    const syncedBalance = asNumber(payload.account.balance);
    if (syncedBalance > 0) {
      await patchDocument(
        env,
        documentPath("users", tokenUserId),
        { startBalance: syncedBalance, updatedAt: now },
        ["startBalance", "updatedAt"],
      ).catch(() => undefined);
    }

    const runId = randomId();
    await patchDocument(
      env,
      documentPath("mt5SyncRuns", runId),
      {
        userId: tokenUserId,
        accountId,
        status: "ok",
        closedTrades: seenTrades.size,
        openPositions: openByTicket.size,
        requestId: payload.sync?.requestId ?? null,
        createdAt: now,
        finishedAt: Date.now(),
      },
      ["userId", "accountId", "status", "closedTrades", "openPositions", "requestId", "createdAt", "finishedAt"],
    ).catch(() => undefined);

    return json({
      ok: true,
      accountId,
      status: "connected",
      serverTime: new Date().toISOString(),
      requestSync,
      received: { closedTrades: seenTrades.size, openPositions: openByTicket.size },
    });
  } catch (error) {
    await patchDocument(
      env,
      documentPath("mt5Accounts", accountId),
      {
        status: "error",
        lastError: error instanceof Error ? error.message.slice(0, 300) : "Sync failed",
        lastErrorAt: Date.now(),
        updatedAt: Date.now(),
      },
      ["status", "lastError", "lastErrorAt", "updatedAt"],
    ).catch(() => undefined);
    throw error;
  }
}

export async function handleMt5Api(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/mt5")) return null;

  try {
    if (url.pathname === "/api/mt5/health") {
      return json({ ok: true, service: "mt5-sync", time: new Date().toISOString() });
    }

    if (url.pathname === "/api/mt5/sync") {
      if (request.method !== "POST") throw new ApiError(405, "Use POST.", "method_not_allowed");
      return await syncTrades(request, env);
    }

    if (url.pathname === "/api/mt5/connections") {
      if (request.method !== "POST") throw new ApiError(405, "Use POST.", "method_not_allowed");
      return await createConnection(request, env);
    }

    const match = url.pathname.match(/^\/api\/mt5\/connections\/([^/]+)\/(rotate|disconnect|sync-now)$/);
    if (match) {
      if (request.method !== "POST") throw new ApiError(405, "Use POST.", "method_not_allowed");
      const accountId = decodeURIComponent(match[1]!);
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(accountId)) {
        throw new ApiError(400, "Invalid connection id.", "invalid_account");
      }
      if (match[2] === "rotate") return await rotateConnection(request, env, accountId);
      if (match[2] === "disconnect") return await disconnectConnection(env, request, accountId);
      return await requestSync(env, request, accountId);
    }

    throw new ApiError(404, "Unknown MT5 API route.", "not_found");
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ ok: false, error: error.message, code: error.code }, error.status);
    }
    console.error("MT5 API error", error);
    return json({ ok: false, error: "The sync server hit an unexpected error.", code: "internal" }, 500);
  }
}
