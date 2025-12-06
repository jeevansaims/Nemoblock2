import React, { useCallback } from "react";
import { format, parse } from "date-fns";

import { Trade } from "@/lib/models/trade";

export type CalendarBlockConfig = {
  id: string;
  isPrimary: boolean;
  trades?: Trade[];
  name?: string;
};

interface YearViewBlockProps {
  block: CalendarBlockConfig;
  baseTrades: Trade[];
  onUpdateTrades: (tradesForBlock: Trade[], name?: string) => void;
  onClose: () => void;
  renderContent: (trades: Trade[]) => React.ReactNode;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Basic CSV split that respects quoted commas.
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((c) => c.trim());
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const candidates = [
    "EEE, MMM d, yyyy h:mm a",
    "EEE, MMM d, yyyy, h:mm a",
    "MMM d, yyyy h:mm a",
    "MMMM d, yyyy h:mm a",
    "M/d/yyyy h:mm a",
    "M/d/yy h:mm a",
    "M/d/yyyy",
    "M/d/yy",
    "yyyy-MM-dd",
    "yyyy/MM/dd",
    "EEE, MMM d, yyyy HH:mm:ss",
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
  ];
  for (const fmt of candidates) {
    const parsed = parse(raw, fmt, new Date());
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}

/**
 * Minimal Option Omega CSV parser for ad-hoc uploads in the Year view.
 * Tolerant: missing fields fall back to safe defaults so we can satisfy Trade.
 */
function parseOptionOmegaCsv(csvText: string): Trade[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const normalizedHeader = headers.map((h) => h.toLowerCase());
  const findIndex = (candidates: string[]) => {
    for (const label of candidates) {
      const idx = normalizedHeader.indexOf(label.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxOpenedOn = findIndex(["Opened On", "Date Opened"]);
  const idxOpeningPrice = findIndex(["Opening Price"]);
  const idxLegs = findIndex(["Legs"]);
  const idxPremium = findIndex(["Premium"]);
  const idxClosingPrice = findIndex(["Closing Price"]);
  const idxClosedOn = findIndex(["Closed On", "Date Closed"]);
  const idxAvgClosingCost = findIndex(["Closing Cost", "Avg. Closing Cost"]);
  const idxReasonForClose = findIndex(["Reason for Close", "Reason For Close"]);
  const idxPL = findIndex(["P/L", "PL", "Net P/L", "Net PL"]);
  const idxContracts = findIndex(["No. of Contracts", "Contracts"]);
  const idxFundsAtClose = findIndex(["Funds at Close"]);
  const idxMarginReq = findIndex(["Margin Req.", "Margin Req"]);
  const idxStrategy = findIndex(["Strategy"]);
  const idxOpeningFees = findIndex(["Opening Commissions + Fees"]);
  const idxClosingFees = findIndex(["Closing Commissions + Fees"]);
  const idxOpeningSLR = findIndex(["Opening S/L Ratio", "Opening Short/Long Ratio"]);
  const idxClosingSLR = findIndex(["Closing S/L Ratio", "Closing Short/Long Ratio"]);
  const idxOpeningVix = findIndex(["Opening VIX"]);
  const idxClosingVix = findIndex(["Closing VIX"]);
  const idxGap = findIndex(["Gap"]);
  const idxMovement = findIndex(["Movement"]);
  const idxMaxProfit = findIndex(["Max Profit"]);
  const idxMaxLoss = findIndex(["Max Loss"]);

  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = splitCsvLine(row);
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx] : "");

    const openedOnRaw = get(idxOpenedOn);
    const openedOn = parseDate(openedOnRaw);
    const closedOnRaw = get(idxClosedOn);
    const closedOn = parseDate(closedOnRaw);

    // Skip if we couldn't parse any meaningful date; avoids 1969/1970 buckets.
    if (!openedOn && !closedOn) continue;

    const strategy = get(idxStrategy) || "Unknown";

    const trade: Trade = {
      dateOpened: openedOn ?? new Date("1970-01-01"),
      timeOpened: "",
      dayKey: openedOn ? format(openedOn, "yyyy-MM-dd") : undefined,
      openingPrice: parseNumber(get(idxOpeningPrice)),
      legs: get(idxLegs) || "",
      premium: parseNumber(get(idxPremium)),
      closingPrice: parseNumber(get(idxClosingPrice)),
      dateClosed: closedOn,
      timeClosed: "",
      avgClosingCost: parseNumber(get(idxAvgClosingCost)),
      reasonForClose: get(idxReasonForClose) || undefined,
      pl: parseNumber(get(idxPL)),
      numContracts: parseNumber(get(idxContracts)),
      fundsAtClose: parseNumber(get(idxFundsAtClose)),
      marginReq: parseNumber(get(idxMarginReq)),
      strategy,
      openingCommissionsFees: parseNumber(get(idxOpeningFees)),
      closingCommissionsFees: parseNumber(get(idxClosingFees)),
      openingShortLongRatio: parseNumber(get(idxOpeningSLR)),
      closingShortLongRatio: parseNumber(get(idxClosingSLR)),
      openingVix: parseNumber(get(idxOpeningVix)),
      closingVix: parseNumber(get(idxClosingVix)),
      gap: parseNumber(get(idxGap)),
      movement: parseNumber(get(idxMovement)),
      maxProfit: parseNumber(get(idxMaxProfit)),
      maxLoss: parseNumber(get(idxMaxLoss)),
    } as Trade;

    trades.push(trade);
  }

  return trades;
}

export function YearViewBlock({
  block,
  baseTrades,
  onUpdateTrades,
  onClose,
  renderContent,
}: YearViewBlockProps) {
  const { isPrimary, trades, name } = block;

  const effectiveTrades = isPrimary ? baseTrades : trades ?? [];
  const hasData = isPrimary || (trades && trades.length > 0);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = parseOptionOmegaCsv(text);
        onUpdateTrades(parsed, file.name);
      } catch (err) {
        console.error("Failed to parse uploaded log", err);
      } finally {
        event.target.value = "";
      }
    },
    [onUpdateTrades]
  );

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {isPrimary ? "Active log" : name ? `Uploaded log: ${name}` : "Uploaded log"}
          </span>
          {!isPrimary && (
            <label className="cursor-pointer text-xs text-sky-400 underline hover:text-sky-300">
              Upload Option Omega log
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}
        </div>
        {!isPrimary && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </header>

      {!hasData && !isPrimary ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs text-slate-500">
          Upload an Option Omega log above to view yearly P/L.
        </div>
      ) : (
        renderContent(effectiveTrades)
      )}
    </section>
  );
}

export default YearViewBlock;
