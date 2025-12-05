import type { DailyPnLPoint } from "@/lib/analytics/pl-analytics";

export type KellyMode = "conservative" | "balanced" | "aggressive";

export interface StrategyAllocationStats {
  strategy: string;
  pf?: number;
  romPct?: number;
  maxDrawdownPct?: number;
  avgFundsPct?: number;
  marginSpikePct?: number;
  clusterId?: number;
}

export interface KellyV3Inputs {
  dailyPnl: DailyPnLPoint[];
  startingCapital: number;
  baselinePortfolioKellyPct: number;
  strategies: StrategyAllocationStats[];
}

export interface StrategyKellyRecommendation {
  strategy: string;
  clusterId?: number;
  pf: number;
  romPct: number;
  maxDrawdownPct: number;
  avgFundsPct: number;
  marginSpikePct: number;
  riskScore: number; // 0..1
  tier: "T1" | "T2" | "T3";
  kellyPctConservative: number;
  kellyPctBalanced: number;
  kellyPctAggressive: number;
}

export interface PortfolioKellyCurvePoint {
  kellyScale: number;
  portfolioKellyPct: number;
  estMaxDdPct: number;
  cagrPct: number;
}

export interface KellyV3Result {
  baselineMaxDdPct: number;
  baselineCagrPct: number;
  baselinePortfolioKellyPct: number;
  strategies: StrategyKellyRecommendation[];
  curve: PortfolioKellyCurvePoint[];
  suggestedScale: {
    conservative?: PortfolioKellyCurvePoint;
    balanced?: PortfolioKellyCurvePoint;
    aggressive?: PortfolioKellyCurvePoint;
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Build an equity curve at a given Kelly scale and return max DD and CAGR.
 */
function simulateEquityForScale(
  dailyPnl: DailyPnLPoint[],
  startingCapital: number,
  kellyScale: number
): { finalEquity: number; maxDdPct: number; cagrPct: number } {
  let equity = startingCapital;
  let peak = startingCapital;
  let maxDd = 0;

  for (const day of dailyPnl) {
    const scaled = day.pl * kellyScale;
    equity += scaled;
    peak = Math.max(peak, equity);
    if (peak > 0) {
      const dd = (peak - equity) / peak;
      maxDd = Math.max(maxDd, dd);
    }
  }

  const days = dailyPnl.length || 1;
  const years = days / 252;
  const cagr = years > 0 ? Math.pow(equity / startingCapital, 1 / years) - 1 : 0;

  return {
    finalEquity: equity,
    maxDdPct: maxDd * 100,
    cagrPct: cagr * 100,
  };
}

function normalize(values: number[]): (v: number | undefined) => number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return () => 0.5;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return () => 0.5;
  return (v) => {
    if (v === undefined || !Number.isFinite(v)) return 0.5;
    return (v - min) / (max - min);
  };
}

function decideTier(score: number): "T1" | "T2" | "T3" {
  if (score >= 0.66) return "T1";
  if (score >= 0.4) return "T2";
  return "T3";
}

function tierKelly(tier: "T1" | "T2" | "T3", mode: KellyMode): [number, number] {
  if (tier === "T1") {
    if (mode === "conservative") return [6, 8];
    if (mode === "balanced") return [10, 12];
    return [12, 14];
  }
  if (tier === "T2") {
    if (mode === "conservative") return [4, 6];
    if (mode === "balanced") return [6, 8];
    return [8, 10];
  }
  // T3
  if (mode === "conservative") return [2, 4];
  if (mode === "balanced") return [4, 6];
  return [6, 8];
}

export function computeAdvancedKellyV3(inputs: KellyV3Inputs): KellyV3Result {
  const { dailyPnl, startingCapital, baselinePortfolioKellyPct, strategies } = inputs;
  const kellyScales = [0.55, 0.8, 0.85, 0.9, 1];

  const baseline = simulateEquityForScale(dailyPnl, startingCapital, 1);

  // strategy risk scores
  const pfNorm = normalize(strategies.map((s) => s.pf ?? 0));
  const romNorm = normalize(strategies.map((s) => s.romPct ?? 0));
  const ddNorm = normalize(strategies.map((s) => s.maxDrawdownPct ?? 0));
  const marginNorm = normalize(strategies.map((s) => s.marginSpikePct ?? 0));

  const strategyRecs: StrategyKellyRecommendation[] = strategies.map((s) => {
    const pfScore = pfNorm(s.pf ?? 0);
    const romScore = romNorm(s.romPct ?? 0);
    const ddScore = 1 - ddNorm(s.maxDrawdownPct ?? 0);
    const marginScore = 1 - marginNorm(s.marginSpikePct ?? 0);
    const allocBoost = clamp((s.avgFundsPct ?? 0) / 10, 0, 0.2);
    const riskScore = clamp(0.25 * pfScore + 0.25 * romScore + 0.25 * ddScore + 0.25 * marginScore + allocBoost, 0, 1);
    const tier = decideTier(riskScore);

    const [consLo, consHi] = tierKelly(tier, "conservative");
    const [balLo, balHi] = tierKelly(tier, "balanced");
    const [aggLo, aggHi] = tierKelly(tier, "aggressive");

    const chooseMid = (lo: number, hi: number) => (lo + hi) / 2;

    return {
      strategy: s.strategy,
      clusterId: s.clusterId,
      pf: s.pf ?? 0,
      romPct: s.romPct ?? 0,
      maxDrawdownPct: s.maxDrawdownPct ?? 0,
      avgFundsPct: s.avgFundsPct ?? 0,
      marginSpikePct: s.marginSpikePct ?? 0,
      riskScore,
      tier,
      kellyPctConservative: chooseMid(consLo, consHi),
      kellyPctBalanced: chooseMid(balLo, balHi),
      kellyPctAggressive: chooseMid(aggLo, aggHi),
    };
  });

  const curve: PortfolioKellyCurvePoint[] = kellyScales.map((scale) => {
    const sim = simulateEquityForScale(dailyPnl, startingCapital, scale);
    return {
      kellyScale: scale,
      portfolioKellyPct: baselinePortfolioKellyPct * scale,
      estMaxDdPct: sim.maxDdPct,
      cagrPct: sim.cagrPct,
    };
  });

  const suggest = (pred: (p: PortfolioKellyCurvePoint) => boolean, fallback: number) => {
    const found = curve.find(pred);
    return found ?? curve.find((c) => Math.abs(c.kellyScale - fallback) < 1e-6);
  };

  const suggestedScale = {
    conservative: suggest((c) => c.estMaxDdPct <= baseline.maxDdPct * 0.7, 0.55),
    balanced: suggest((c) => Math.abs(c.kellyScale - 0.8) < 1e-6, 0.8),
    aggressive: suggest((c) => Math.abs(c.kellyScale - 1) < 1e-6, 1),
  };

  return {
    baselineMaxDdPct: baseline.maxDdPct,
    baselineCagrPct: baseline.cagrPct,
    baselinePortfolioKellyPct,
    strategies: strategyRecs,
    curve,
    suggestedScale,
  };
}
