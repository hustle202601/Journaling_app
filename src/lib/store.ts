import { useSyncExternalStore } from "react";
import type { Trade } from "./trades";

const KEY = "tj.trades.v1";
const BAL_KEY = "tj.startBalance.v1";
type State = { trades: Trade[]; startBalance: number; isSample: boolean };
let state: State = { trades: [], startBalance: 10000, isSample: false };
let loaded = false;
const subs = new Set<() => void>();
const EMPTY: State = { trades: [], startBalance: 10000, isSample: false };

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
    if (state.isSample) state = { ...state, trades: [], isSample: false };
    const b = localStorage.getItem(BAL_KEY);
    if (b) state.startBalance = +b;
  } catch { /* ignore */ }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify({ trades: state.trades, isSample: state.isSample }));
  localStorage.setItem(BAL_KEY, String(state.startBalance));
  subs.forEach((f) => f());
}

export const tradeStore = {
  /** Merge trades, de-duplicating by ticket id. Returns number of new trades. */
  importTrades(incoming: Trade[], replaceSample = true) {
    load();
    const base = state.isSample && replaceSample ? [] : state.trades;
    const ids = new Set(base.map((t) => t.id));
    const fresh = incoming.filter((t) => !ids.has(t.id));
    state = { ...state, trades: [...base, ...fresh], isSample: false };
    save();
    return fresh.length;
  },
  loadSample(trades: Trade[]) { load(); state = { ...state, trades, isSample: true }; save(); },
  clear() { load(); state = { ...state, trades: [], isSample: false }; save(); },
  setStartBalance(v: number) { load(); state = { ...state, startBalance: v }; save(); },
};

export function useTrades(): State {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => { load(); return state; },
    () => EMPTY,
  );
}
