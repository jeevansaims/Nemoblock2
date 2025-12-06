import React, { useCallback } from "react";

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

/**
 * Minimal Option Omega CSV parser for ad-hoc uploads in the Year view.
 * This is intentionally tolerant: missing fields fall back to safe defaults
 * so we can satisfy the required `Trade` shape.
 */
function parseOptionOmegaCsv(csvText: string): Trade[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const getIndex = (label: string) => headers.indexOf(label);

  const idxDateOpened = getIndex("Date Opened");
  const idxTimeOpened = getIndex("Time Opened");
  const idxOpeningPrice = getIndex("Opening Price");
  const idxLegs = getIndex("Legs");
  const idxPremium = getIndex("Premium");
  const idxClosingPrice = getIndex("Closing Price");
  const idxDateClosed = getIndex("Date Closed");
  const idxTimeClosed = getIndex("Time Closed");
  const idxAvgClosingCost = getIndex("Avg. Closing Cost");
  const idxReasonForClose = getIndex("Reason For Close");
  const idxPL = getIndex("P/L");
  const idxContracts = getIndex("No. of Contracts");
  const idxFundsAtClose = getIndex("Funds at Close");
  const idxMarginReq = getIndex("Margin Req.");
  const idxStrategy = getIndex("Strategy");
  const idxOpeningFees = getIndex("Opening Commissions + Fees");
  const idxClosingFees = getIndex("Closing Commissions + Fees");
  const idxOpeningSLR = getIndex("Opening Short/Long Ratio");
  const idxClosingSLR = getIndex("Closing Short/Long Ratio");
  const idxOpeningVix = getIndex("Opening VIX");
  const idxClosingVix = getIndex("Closing VIX");
  const idxGap = getIndex("Gap");
  const idxMovement = getIndex("Movement");
  const idxMaxProfit = getIndex("Max Profit");
  const idxMaxLoss = getIndex("Max Loss");

  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = row.split(",").map((c) => c.trim());
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx] : "");

    const dateOpenedRaw = get(idxDateOpened);
    const timeOpened = get(idxTimeOpened) || "00:00:00";
    const openedOn = dateOpenedRaw ? new Date(`${dateOpenedRaw} ${timeOpened}`) : new Date("1970-01-01");
    const dateClosedRaw = get(idxDateClosed);
    const timeClosed = get(idxTimeClosed) || undefined;
    const closedOn = dateClosedRaw ? new Date(`${dateClosedRaw} ${timeClosed ?? "00:00:00"}`) : undefined;

    const strategy = get(idxStrategy) || "Unknown";

    const trade: Trade = {
      dateOpened: openedOn,
      timeOpened,
      openingPrice: parseNumber(get(idxOpeningPrice)),
      legs: get(idxLegs) || "",
      premium: parseNumber(get(idxPremium)),
      closingPrice: parseNumber(get(idxClosingPrice)),
      dateClosed: closedOn,
      timeClosed: timeClosed || undefined,
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
    };

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
