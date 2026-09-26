export const BRAND = Object.freeze({
  blue: 0x287ba7, green: 0x20854a, red: 0xc43d4b, teal: 0x18a6a2,
  purple: 0x814bc7, neutral: 0x667085,
  site: "https://woehammer-stats.pages.dev/aos-v2/",
});

export function rateBand(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return { emoji: "⚪", color: BRAND.neutral };
  if (value > 0.55) return { emoji: "🔵", color: BRAND.blue };
  if (value < 0.45) return { emoji: "🔴", color: BRAND.red };
  return { emoji: "🟢", color: BRAND.green };
}

export const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "—";
export function signedPP(value) { const points = Number(value) * 100; return Number.isFinite(points) ? `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp` : "—"; }
export function bar(value, maximum, width = 8) { const ratio = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0; const filled = Math.round(ratio * width); return `${"█".repeat(filled)}${"░".repeat(width - filled)}`; }
export const periodLabel = (engine) => engine?.dataset?.getMeta?.().battlescrollLabel ?? "Current battlescroll";
export function statsUrl(page, params = {}) { const url = new URL(page, BRAND.site); for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value); return url.toString(); }
export function countryColor(country) { return ({ "United Kingdom": 0x1f4e9e, "United States": 0xb22234, Canada: 0xd80621, Australia: 0x1b4d8c, France: 0x2455a4, Germany: 0x202020, Sweden: 0x006aa7, Norway: 0xba0c2f, Denmark: 0xc60c30, Poland: 0xdc143c, Spain: 0xaa151b, Italy: 0x008c45 })[country] ?? BRAND.purple; }
export const RATE_KEY = "🔵 Over 55%  ·  🟢 45–55%  ·  🔴 Under 45%";
