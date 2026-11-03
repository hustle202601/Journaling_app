import { useSyncExternalStore } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase/client";
import { getActiveUser, subscribeActiveUser, tradeDocId } from "./firebase/session";
import type { Trade } from "./trades";

const KEY = "tj.trades.v1";
const BAL_KEY = "tj.startBalance.v1";

/** Explicit shape so property access stays type-safe with noPropertyAccessFromIndexSignature. */
type FirestoreRecord = {
  id?: unknown;
  source?: unknown;
  symbol?: unknown;
  side?: unknown;
  volume?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
  openPrice?: unknown;
  closePrice?: unknown;
  sl?: unknown;
  tp?: unknown;
  commission?: unknown;
  swap?: unknown;
  profit?: unknown;
  accountId?: unknown;
  positionId?: unknown;
  dealId?: unknown;
  closeReason?: unknown;
  comment?: unknown;
  magic?: unknown;
  userId?: unknown;
  startBalance?: unknown;
  startBalanceManual?: unknown;
  label?: unknown;
  status?: unknown;
  balance?: unknown;
  equity?: unknown;
  lastSyncAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export interface TradeState {
  trades: Trade[];
  startBalance: number;
  startBalanceManual: boolean;
  isSample: boolean;
  loading: boolean;
  mt5Balance: number | null;
  mt5Equity: number | null;
  mt5AccountLabel: string | null;
  mt5LastSyncAt: number | null;
  accountLabels: Record<string, string>;
  localCount: number;
}

const EMPTY: TradeState = {
  trades: [],
  startBalance: 10000,
  startBalanceManual: false,
  isSample: false,
  loading: false,
  mt5Balance: null,
  mt5Equity: null,
  mt5AccountLabel: null,
  mt5LastSyncAt: null,
  accountLabels: {},
  localCount: 0,
};

let state: TradeState = EMPTY;
let loaded = false;
let activeUid: string | null = null;
let localTrades: Trade[] = [];
let localStartBalance = 10000;
let unsubs: (() => void)[] = [];
const subs = new Set<() => void>();

function emit() {
  subs.forEach((fn) => fn());
}

function setState(next: Partial<TradeState>) {
  state = { ...state, ...next };
  emit();
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function withSource(trade: Trade): Trade {
  return { ...trade, source: trade.source ?? "manual" };
}

function tradeKey(trade: Trade): string {
  return `${trade.source ?? "manual"}_${trade.id}`;
}

function fromFirestore(id: string, data: FirestoreRecord): Trade {
  const source = data.source === "mt5" ? "mt5" : "manual";
  const trade: Trade = {
    id: typeof data.id === "string" ? data.id : id,
    symbol: typeof data.symbol === "string" ? data.symbol : "",
    side: data.side === "sell" ? "sell" : "buy",
    volume: num(data.volume),
    openTime: typeof data.openTime === "string" ? data.openTime : "",
    closeTime: typeof data.closeTime === "string" ? data.closeTime : "",
    openPrice: num(data.openPrice),
    closePrice: num(data.closePrice),
    sl: nullableNum(data.sl),
    tp: nullableNum(data.tp),
    commission: num(data.commission),
    swap: num(data.swap),
    profit: num(data.profit),
    source,
  };
  if (typeof data.accountId === "string") trade.accountId = data.accountId;
  if (typeof data.positionId === "string") trade.positionId = data.positionId;
  if (typeof data.dealId === "string") trade.dealId = data.dealId;
  if (typeof data.closeReason === "string") trade.closeReason = data.closeReason;
  if (typeof data.comment === "string") trade.comment = data.comment;
  if (typeof data.magic === "number") trade.magic = data.magic;
  return trade;
}

function toFirestore(trade: Trade, userId: string): FirestoreRecord {
  const data: FirestoreRecord = {
    userId,
    source: trade.source ?? "manual",
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    volume: trade.volume,
    openTime: trade.openTime,
    closeTime: trade.closeTime,
    openPrice: trade.openPrice,
    closePrice: trade.closePrice,
    sl: trade.sl,
    tp: trade.tp,
    commission: trade.commission,
    swap: trade.swap,
    profit: trade.profit,
    updatedAt: Date.now(),
  };
  if (trade.accountId) data.accountId = trade.accountId;
  if (trade.positionId) data.positionId = trade.positionId;
  if (trade.dealId) data.dealId = trade.dealId;
  if (trade.closeReason) data.closeReason = trade.closeReason;
  if (trade.comment) data.comment = trade.comment;
  if (trade.magic !== undefined) data.magic = trade.magic;
  return data;
}

function loadLocal() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { trades?: Trade[]; isSample?: boolean };
      if (Array.isArray(parsed.trades)) {
        localTrades = parsed.isSample ? [] : parsed.trades.map(withSource);
      }
    }
    const storedBalance = localStorage.getItem(BAL_KEY);
    if (storedBalance != null) {
      const parsed = Number(storedBalance);
      if (Number.isFinite(parsed)) localStartBalance = parsed;
    }
  } catch {
    // Ignore a corrupt local cache; the journal will start empty.
  }
  setState({
    trades: localTrades,
    startBalance: localStartBalance,
    startBalanceManual: true,
    isSample: false,
    localCount: localTrades.length,
  });
}

function saveLocal() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ trades: localTrades, isSample: false }));
    localStorage.setItem(BAL_KEY, String(localStartBalance));
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory journal.
  }
}

function stopFirestore() {
  unsubs.forEach((unsubscribe) => unsubscribe());
  unsubs = [];
}

function startFirestore(uid: string) {
  const db = getFirebaseDb();
  if (!db) {
    setState({ loading: false, trades: [] });
    return;
  }

  unsubs.push(
    onSnapshot(
      query(collection(db, "trades"), where("userId", "==", uid)),
      (snapshot) => {
        const trades = snapshot.docs
          .map((item) => fromFirestore(item.id, item.data() as FirestoreRecord))
          .sort((a, b) => a.closeTime.localeCompare(b.closeTime));
        setState({ trades, loading: false });
      },
      (caught) => {
        console.error("Could not load trades", caught);
        setState({ loading: false });
      },
    ),
  );

  unsubs.push(
    onSnapshot(
      doc(db, "users", uid),
      (snapshot) => {
        const data = (snapshot.data() ?? {}) as FirestoreRecord;
        setState({
          startBalance: typeof data.startBalance === "number" && Number.isFinite(data.startBalance) ? data.startBalance : 10000,
          startBalanceManual: data.startBalanceManual === true,
        });
      },
      (caught) => {
        console.error("Could not load the user profile", caught);
      },
    ),
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, "mt5Accounts"), where("userId", "==", uid)),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => {
          const data = item.data() as FirestoreRecord;
          return {
            id: item.id,
            label: typeof data.label === "string" ? data.label : "MetaTrader 5",
            status: typeof data.status === "string" ? data.status : "pending",
            balance: nullableNum(data.balance),
            equity: nullableNum(data.equity),
            lastSyncAt: num(data.lastSyncAt),
            createdAt: num(data.createdAt),
          };
        });

        const accountLabels: Record<string, string> = {};
        for (const row of rows) accountLabels[row.id] = row.label;

        const latest = rows
          .filter((row) => row.balance != null)
          .sort((a, b) => {
            const aConnected = a.status === "connected" ? 1 : 0;
            const bConnected = b.status === "connected" ? 1 : 0;
            if (aConnected !== bConnected) return bConnected - aConnected;
            return b.lastSyncAt - a.lastSyncAt || b.createdAt - a.createdAt;
          })[0];

        setState({
          accountLabels,
          mt5Balance: latest?.balance ?? null,
          mt5Equity: latest?.equity ?? null,
          mt5AccountLabel: latest?.label ?? null,
          mt5LastSyncAt: latest?.lastSyncAt ? latest.lastSyncAt : null,
        });
      },
      (caught) => {
        console.error("Could not load MT5 accounts", caught);
      },
    ),
  );
}

function applyActiveUser(uid: string | null) {
  if (uid === activeUid) return;
  activeUid = uid;
  stopFirestore();

  if (!uid) {
    setState({
      trades: localTrades,
      startBalance: localStartBalance,
      startBalanceManual: true,
      isSample: false,
      loading: false,
      mt5Balance: null,
      mt5Equity: null,
      mt5AccountLabel: null,
      mt5LastSyncAt: null,
      accountLabels: {},
      localCount: localTrades.length,
    });
    return;
  }

  setState({
    trades: [],
    startBalance: 10000,
    startBalanceManual: false,
    isSample: false,
    loading: true,
    mt5Balance: null,
    mt5Equity: null,
    mt5AccountLabel: null,
    mt5LastSyncAt: null,
    accountLabels: {},
    localCount: localTrades.length,
  });
  startFirestore(uid);
}

if (typeof window !== "undefined") {
  loadLocal();
  subscribeActiveUser(() => applyActiveUser(getActiveUser()));
  if (getActiveUser()) applyActiveUser(getActiveUser());
}

export const tradeStore = {
  /** Merge trades, de-duplicating by source + ticket id. Returns number of new trades. */
  async importTrades(incoming: Trade[], replaceSample = true): Promise<number> {
    const uid = getActiveUser();
    const current = uid ? state.trades : state.isSample && replaceSample ? [] : localTrades;
    const ids = new Set(current.map(tradeKey));
    const fresh = incoming.map(withSource).filter((trade) => !ids.has(tradeKey(trade)));
    if (!fresh.length) return 0;

    if (uid) {
      const db = getFirebaseDb();
      if (!db) throw new Error("Firestore is not available.");
      await Promise.all(
        fresh.map((trade) => setDoc(doc(db, "trades", tradeDocId(trade)), toFirestore(trade, uid))),
      );
      return fresh.length;
    }

    localTrades = [...(state.isSample && replaceSample ? [] : localTrades), ...fresh];
    saveLocal();
    setState({ trades: localTrades, isSample: false, localCount: localTrades.length });
    return fresh.length;
  },

  loadSample(trades: Trade[]) {
    if (getActiveUser()) return;
    localTrades = trades.map(withSource);
    setState({ trades: localTrades, isSample: true, localCount: localTrades.length });
  },

  async clear(): Promise<void> {
    const uid = getActiveUser();
    if (uid) {
      const db = getFirebaseDb();
      if (!db) throw new Error("Firestore is not available.");
      const snapshot = await getDocs(query(collection(db, "trades"), where("userId", "==", uid)));
      const docs = snapshot.docs;
      for (let index = 0; index < docs.length; index += 400) {
        const batch = writeBatch(db);
        for (const item of docs.slice(index, index + 400)) batch.delete(item.ref);
        await batch.commit();
      }
      setState({ trades: [] });
      return;
    }

    localTrades = [];
    saveLocal();
    setState({ trades: [], isSample: false, localCount: 0 });
  },

  async setStartBalance(value: number): Promise<void> {
    const next = Number.isFinite(value) ? value : 0;
    const uid = getActiveUser();
    if (uid) {
      const db = getFirebaseDb();
      if (!db) throw new Error("Firestore is not available.");
      await setDoc(
        doc(db, "users", uid),
        { startBalance: next, startBalanceManual: true, updatedAt: Date.now() },
        { merge: true },
      );
      setState({ startBalance: next, startBalanceManual: true });
      return;
    }

    localStartBalance = next;
    saveLocal();
    setState({ startBalance: next, startBalanceManual: true });
  },

  /** Stop using a manual starting balance and follow the synced MT5 balance again. */
  async resetStartBalance(): Promise<void> {
    const uid = getActiveUser();
    if (uid) {
      const db = getFirebaseDb();
      if (!db) throw new Error("Firestore is not available.");
      await setDoc(
        doc(db, "users", uid),
        { startBalanceManual: false, updatedAt: Date.now() },
        { merge: true },
      );
      setState({ startBalanceManual: false });
      return;
    }
    setState({ startBalanceManual: false });
  },

  /** Move trades that were imported before signing in into the signed-in journal. */
  async migrateLocalTrades(): Promise<number> {
    const uid = getActiveUser();
    if (!uid || !localTrades.length) return 0;
    const db = getFirebaseDb();
    if (!db) throw new Error("Firestore is not available.");

    const existing = new Set(state.trades.map(tradeKey));
    const fresh = localTrades.map(withSource).filter((trade) => !existing.has(tradeKey(trade)));
    await Promise.all(
      fresh.map((trade) => setDoc(doc(db, "trades", tradeDocId(trade)), toFirestore(trade, uid))),
    );

    localTrades = [];
    saveLocal();
    setState({ localCount: 0 });
    return fresh.length;
  },

  async deleteTrade(trade: Trade): Promise<void> {
    const uid = getActiveUser();
    if (uid) {
      const db = getFirebaseDb();
      if (!db) throw new Error("Firestore is not available.");
      await deleteDoc(doc(db, "trades", tradeDocId(trade)));
      return;
    }
    localTrades = localTrades.filter((item) => tradeKey(item) !== tradeKey(trade));
    saveLocal();
    setState({ trades: localTrades, localCount: localTrades.length });
  },
};

const subscribe = (callback: () => void) => {
  subs.add(callback);
  return () => {
    subs.delete(callback);
  };
};

const getSnapshot = () => {
  loadLocal();
  return state;
};

const getServerSnapshot = () => EMPTY;

export function useTrades(): TradeState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
