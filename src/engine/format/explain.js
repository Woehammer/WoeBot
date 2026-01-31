// ==================================================
// FORMATTER: EXPLANATIONS
// PURPOSE: Plain-English contextual explanations
// ==================================================

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

// --------------------------------------------------
// SAMPLE SIZE CONTEXT
// --------------------------------------------------
export function explainSampleSize({ games = 0, results = 0 } = {}) {
  if (!games && !results) return "";

  if (games < 30) {
    return "Results are based on a **very small sample**, so expect volatility and outliers.";
  }

  if (games < 100) {
    return "Results are based on a **limited sample**. Trends are emerging, but caution is still advised.";
  }

  return "Results are based on a **healthy sample size**, making trends more reliable.";
}

// --------------------------------------------------
// ELO BASELINE (vs 400)
// --------------------------------------------------
export function explainEloBaseline({ average } = {}) {
  if (!Number.isFinite(average)) return "";

  const delta = average - 400;

  if (Math.abs(delta) < 10) {
    return "The average Elo sits close to the **400 baseline**, suggesting a broadly average player pool.";
  }

  if (delta > 0) {
    return `The average Elo is **${Math.round(delta)} points above** the 400 baseline, indicating this faction attracts **stronger-than-average players**.`;
  }

  return `The average Elo is **${Math.round(Math.abs(delta))} points below** the 400 baseline, suggesting a **weaker or less experienced player pool** overall.`;
}

// --------------------------------------------------
// ELO SKEW (AVERAGE vs MEDIAN)
// --------------------------------------------------
export function explainEloSkew({ average, median } = {}) {
  if (!Number.isFinite(average) || !Number.isFinite(median)) return "";

  const gap = average - median;

  if (Math.abs(gap) < 5) {
    return "The average and median Elo are closely aligned, indicating a **fairly even spread of player skill**.";
  }

  if (gap > 0) {
    return "The average Elo sits **above the median**, suggesting results are being **pulled up by a smaller group of high-performing players**.";
  }

  return "The median Elo sits **above the average**, suggesting a **broader mid-skill base** with fewer extreme outliers.";
}

// --------------------------------------------------
// PLAYER FINISH DISTRIBUTION (5–0, 4–1, etc.)
// --------------------------------------------------
export function explainPlayerFinishes({ considered = 0 } = {}) {
  if (!considered) {
    return "There were **no clean 5-round results** available to analyse player finishing positions.";
  }

  return "Most players are finishing events around the **3–2 / 2–3 range**, which typically reflects **mid-table consistency rather than spike performance**.";
}

// --------------------------------------------------
// WIN RATE vs ELO INTERPRETATION (DEEP CONTEXT)
// --------------------------------------------------
export function explainWinRateVsElo({
  winRate,
  avgElo,
  medianElo,
  games = 0,
} = {}) {
  if (
    !Number.isFinite(winRate) ||
    !Number.isFinite(avgElo) ||
    !Number.isFinite(medianElo)
  ) {
    return "";
  }

  const wr = winRate;
  const eloDelta = avgElo - 400;
  const skew = avgElo - medianElo;

  // Classify bands
  const wrBand =
    wr >= 0.55 ? "high" :
    wr <= 0.45 ? "low" :
    "mid";

  const eloBand =
    Math.abs(eloDelta) < 10 ? "baseline" :
    eloDelta > 0 ? "above" : "below";

  const skewBand =
    Math.abs(skew) < 5 ? "flat" :
    skew > 0 ? "top-heavy" : "bottom-heavy";

  // Interpretations
  if (wrBand === "high") {
    if (eloBand === "below") {
      return "A **high win rate despite a weaker player pool** suggests the faction itself is doing heavy lifting — strong rules, matchups, or scoring plans are carrying results.";
    }

    if (eloBand === "above" && skewBand === "top-heavy") {
      return "A **high win rate with a top-heavy Elo profile** suggests results are being **driven by elite pilots**, rather than broad faction power.";
    }

    return "A **high win rate combined with a strong player pool** indicates a faction that is both **powerful and well-understood** by its users.";
  }

  if (wrBand === "low") {
    if (eloBand === "above") {
      return "A **low win rate despite strong players** is a warning sign — even good pilots are struggling to convert results, pointing to possible faction or matchup issues.";
    }

    if (eloBand === "below") {
      return "A **low win rate with a weaker player pool** is harder to diagnose — this may be a mix of player inexperience and genuine faction limitations.";
    }

    return "A **low win rate with an average player pool** suggests the faction is underperforming in the current meta.";
  }

  // Mid win rate cases
  if (eloBand === "above" && skewBand === "top-heavy") {
    return "A **middling win rate with a top-heavy Elo profile** suggests the faction can succeed in expert hands, but lacks consistency for the wider field.";
  }

  if (eloBand === "below") {
    return "A **middling win rate despite a weaker player pool** is quietly positive — performance may improve as player skill increases.";
  }

  return "A **middling win rate with an average Elo profile** suggests a fairly balanced faction, where outcomes are driven more by play skill and pairings than raw power.";
}

// ==================================================
// EXPORTS
// ==================================================
export default {
  explainSampleSize,
  explainEloBaseline,
  explainEloSkew,
  explainPlayerFinishes,
  explainWinRateVsElo,
};