import type { Trade } from "@/lib/trades";

let activeUid: string | null = null;
const subs = new Set<() => void>();

export function getActiveUser(): string | null {
  return activeUid;
}

export function setActiveUser(uid: string | null) {
  if (activeUid === uid) return;
  activeUid = uid;
  subs.forEach((fn) => fn());
}

export function subscribeActiveUser(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function tradeDocId(trade: Trade): string {
  const source = trade.source ?? "manual";
  return encodeURIComponent(`${source}_${trade.id}`);
}
