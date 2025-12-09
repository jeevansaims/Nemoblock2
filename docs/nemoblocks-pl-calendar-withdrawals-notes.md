# NemoBlocks – P/L Calendar & Withdrawal Simulator Notes

Internal notes on how the P/L Calendar + Withdrawal Simulator actually work in NemoBlocks, and all the landmines we hit getting here.

This is Nemo-only; don’t upstream this file.

---

## 1. High-Level Architecture

### P/L Calendar
- **Data source:** active block + uploaded Option Omega logs.
- **Core pipeline:**
  1. Parse OO logs → `Trade` + optional `DailyLogEntry`.
  2. Build monthly and yearly P/L maps from trades (`monthlyPl["YYYY-MM"]`).
  3. Build equity/drawdown series from daily logs (if available), otherwise synth from trades.
  4. Calendar UI (`PLCalendarPanel` → `YearViewBlock` / heatmap / tiles) always renders from filtered and normalized arrays, never from global stores.

### Withdrawal Simulator
- **Lives in:** P/L Analytics, but consumes the same monthly P/L as P/L Calendar.
- **Key idea:** the simulator is a pure function over:
  - `startingBalance`
  - `baselineStartingCapital` (e.g. 160k)
  - `monthlyPl["YYYY-MM"]` (calendar’s baseline P/L)
  - `withdrawal settings` (mode, % or fixed $, reset-to-start, etc.)

---

## 2. Max Drawdown (Calendar & Blocks)

### Lessons learned
- We had three different DD paths at one point:
  - **Block Stats** → `PortfolioStatsCalculator` on equity curve
  - **Performance/PL Calendar** → legacy inline calc (commit `99268ce`)
  - **Uploaded logs** → incomplete/empty `drawdownPct` column parsing
- **That caused:**
  - Active block and duplicated uploaded log to match,
  - But other uploaded logs showed wrong Max DD (0% or random values).

### Final approach
- **Source of truth:** equity / Net Liquidity–based series, not hand-rolled percent fields.
- **For uploaded OO logs:**
  - Parse Net Liquidity / equity or Drawdown % if present.
  - When `drawdownPct` is present, `Max DD = max(abs(drawdownPct))`.
  - Otherwise, fall back to legacy inline curve calc (`99268ce` logic).

### Sanity checks
For any new change touching DD / equity:
- **For the same log:**
  - Block Stats Max DD == P/L Calendar “Max Drawdown” (for the same date range & sizing mode).
- **Upload the same log as:**
  - Active block, and
  - Uploaded block → both show identical Max DD.
- **Where `drawdownPct` exists in CSV:**
  - `max(|drawdownPct|)` matches UI Max DD to within rounding.

---

## 3. Date Range Filtering

We added a global date range picker to:
- Performance Blocks ✅
- Block Stats ✅
- P/L Calendar (active + uploaded logs) ✅

### Pitfalls we hit
- Picker was visible everywhere, but only Performance Blocks actually filtered data.
- Block Stats stats were filtered, but calendar tiles inside Block Stats still showed all-time.
- Some calendar children (e.g. `YearViewBlock`) still grabbed trades from stores instead of props.

### Final rules
1. **Single source of date truth:**
   ```typescript
   const [dateRange, setDateRange] = useState<DateRange | undefined>();
   ```
   Passed down to every calendar instance:
   ```tsx
   <PLCalendarPanel
     trades={blockTrades}
     dailyLogs={blockDailyLogs}
     dateRange={dateRange}
   />
   ```

2. **Filtering happens inside `PLCalendarPanel`:**
   ```typescript
   const filteredTrades = useMemo(
     () => trades.filter((t) =>
       isWithinRange(t.closedOn ?? t.dateClosed ?? t.openedOn, dateRange)
     ),
     [trades, dateRange]
   );

   const filteredDailyLogs = useMemo(
     () => (dailyLogs ?? []).filter((d) =>
       isWithinRange(d.date, dateRange)
     ),
     [dailyLogs, dateRange]
   );
   ```

3. **After that, no one uses raw trades / dailyLogs:**
   - All aggregates and children (Year view, heatmap, stats, Max DD) get `filteredTrades` + `filteredDailyLogs`.
   - Child components must be pure:
     - No `useBlockStore` / `usePerformanceStore` inside them.
     - No re-fetching trades by block ID.

### Sanity checks
- Narrow the date range to 1–2 months:
  - Calendar tiles only show that period.
  - Max DD & header stats change.
  - “All time” restores full history.
  - Upload logs + active block respond identically to the same date range.

---

## 4. Withdrawal Simulator vs P/L Calendar

This was the subtle one:
- **Total withdrawn** matched block Net P/L ✅
- But **per-month P/L** in the simulator was off by ~10–20% vs P/L Calendar ❌

### Root cause:
- Simulator was using a different monthly P/L series (equity-based returns) than P/L Calendar (trade-sum monthly P/L).
- Over the entire backtest, integrals matched, but monthly distribution did not.

### Final decision
**Simulator baseline must be:**
The same `monthlyPl["YYYY-MM"]` map that P/L Calendar uses for its monthly tiles.

**Implementation sketch:**
```typescript
// From calendar / performance snapshot:
const calendarMonthlyPl: Record<string, number> = ...; // "YYYY-MM" -> P/L

// Simulation loop:
for (const monthKey of monthKeysSorted) {
  const basePnl = calendarMonthlyPl[monthKey]; // baseline P/L
  const baseReturn = basePnl / baselineStartingCapital; // monthly return %
  const scaledPnl = baseReturn * equity;                // P/L on current equity
  // ... then withdrawals, reset-to-start, DD, etc.
}
```

### Sanity config that must match calendar
With:
- Starting balance = Base capital = `baselineStartingCapital`
- Mode = None or `percentOfProfit` with 0%
- Reset to start = ON
- Normalize to 1-lot = OFF
- Withdraw only on profitable months = ON (but irrelevant at 0%)

**We should see:**
- P/L (scaled) per month == P/L Calendar monthly tiles.
- Withdrawal per month == P/L (scaled) (because reset-to-start + no extra mode).
- Total withdrawn == Net P/L from block.
- Final equity = `startingBalance`; CAGR ≈ 0, Max DD ≈ 0.

### Simulator sanity checks
When modifying simulator code:
- Run the config above and confirm:
  - P/L column == calendar’s monthly P/L for the same period.
- Try:
  - 50% percent-of-profit withdrawals,
  - `reset-to-start` OFF → check equity curve looks like compounding.
  - Ensure no negative equity:
    - If `equity + monthProfit - withdrawal < 0`, cap withdrawal.

---

## 5. Upstream vs NemoBlocks Workflow

To avoid another history nightmare:

### Nemoblocks rules
- `origin` = `jeevansaims/NemoBlocks`
- `upstream` = `davidromeo/tradeblocks`

### Upstreaming a feature (e.g. P/L Calendar updates):
1. **Create clean branch from upstream:**
   ```bash
   git fetch upstream
   git checkout -B pl-calendar-upstream upstream/feature/pl-calendar
   ```

2. **Copy only relevant files from Nemo branch:**
   ```bash
   git checkout feature/avg-pl-and-withdrawals -- \
     app/(platform)/pl-calendar/page.tsx \
     components/pl-calendar/
   ```

3. **Check diff, run build, then:**
   ```bash
   npm run build
   git commit -am "Update P/L Calendar date-range & uploaded-log behavior"
   git push upstream pl-calendar-upstream:feature/pl-calendar
   ```
4. **DM Romeo**; don’t push Nemo branding / package.json / lockfile changes upstream.

### Pulling upstream features (e.g. Report Builder, PR #111, etc.):
- Prefer `git checkout upstream/branch -- path/to/files` over merging whole branches.
- Only pull:
  - Page/component files,
  - Required lib helpers,
  - Minimal dependency additions.

---

## 6. Future Sanity Checks to Add (TODO)

Things to automate or at least keep in mind:
- **Lightweight unit tests:**
  - **P/L Calendar:** Given a tiny trade set, verify `monthlyPl` and Max DD match expected.
  - **Withdrawal Simulator:** Hard-code a 3–4 month series and ensure the outputs match the hand-calculated example.
- **Dev debug toggles:**
  - Optional debug panel to show:
    - `max |drawdownPct|` from CSV,
    - `maxDrawdown` computed from equity,
    - A “calendar vs simulator monthly P/L diff” for a tiny sample.

---

*Use this document as a reference for any future changes to P/L or Simulation logic to maintain data integrity and consistency across views.*
