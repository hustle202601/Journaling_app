import { decodeFile, parseReport, rowsToTrades, type Trade } from "./trades";

/** Reads an MT5 report file (HTML, CSV or Excel .xlsx) and returns closed positions. */
export async function readReportFile(f: File): Promise<Trade[]> {
  const buf = await f.arrayBuffer();
  const b = new Uint8Array(buf);
  const isZip = b[0] === 0x50 && b[1] === 0x4b; // xlsx is a zip
  if (isZip || /\.xlsx?$/i.test(f.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" })
        .map((r) => r.map((c) => String(c ?? "")));
      const t = rowsToTrades(rows);
      if (t.length) return t;
    }
    return [];
  }
  return parseReport(decodeFile(buf));
}
