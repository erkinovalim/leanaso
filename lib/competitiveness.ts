import type { App } from "./appstore";
import { scoreLabel } from "./popularity";

export type Competitiveness = {
  /** 0–100. How established the top 10 results are, i.e. how hard they are to outrank. */
  score: number;
  label: ReturnType<typeof scoreLabel>;
  medianRatings: number;
  avgRating: number | null;
  /** How many of the top 10 shipped an update in the last 90 days. */
  activeCount: number;
};

/**
 * Each of the top 10 apps gets a 0–1 strength:
 *
 *   size × (0.5 + 0.25 × quality + 0.25 × activity)
 *
 * - size: ratings count on a log scale (100 → 0, 1M → 1). Ratings are the
 *   best public proxy for downloads, so this dominates: a small app is easy
 *   to beat however good it is.
 * - quality: average rating, 3.5★ → 0, 5★ → 1.
 * - activity: updated in the last 90 days → 1, fading to 0 at two years.
 *
 * Strengths are averaged with higher ranks weighted more (1/√rank), since
 * dislodging #1 matters more than #10.
 */
export function getCompetitiveness(apps: App[]): Competitiveness | null {
  const top = apps.slice(0, 10);
  if (!top.length) return null;

  let weighted = 0;
  let weights = 0;
  for (const a of top) {
    const size = clamp((Math.log10(a.ratingCount + 1) - 2) / 4);
    const quality = a.rating === null ? 0 : clamp((a.rating - 3.5) / 1.5);
    const activity = clamp(1 - (a.daysSinceUpdate - 90) / 640);
    const w = 1 / Math.sqrt(a.rank);
    weighted += w * size * (0.5 + 0.25 * quality + 0.25 * activity);
    weights += w;
  }
  const score = Math.round((100 * weighted) / weights);

  const counts = top.map((a) => a.ratingCount).sort((x, y) => x - y);
  const m = Math.floor(counts.length / 2);
  const rated = top.filter((a) => a.rating !== null);

  return {
    score,
    label: scoreLabel(score),
    medianRatings: Math.round(counts.length % 2 ? counts[m] : (counts[m - 1] + counts[m]) / 2),
    avgRating: rated.length ? rated.reduce((s, a) => s + a.rating!, 0) / rated.length : null,
    activeCount: top.filter((a) => a.daysSinceUpdate <= 90).length,
  };
}

function clamp(n: number) {
  return Math.min(1, Math.max(0, n));
}
