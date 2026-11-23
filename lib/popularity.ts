import { cacheLife } from "next/cache";
import { storefrontHeader, type Country } from "./countries";
import { getPlaySuggestions } from "./playstore";
import type { Store } from "./stores";

export type Popularity = {
  /** 5–100. 5 means the store never suggests this keyword. */
  score: number;
  label: ReturnType<typeof scoreLabel>;
  /** Shortest prefix that makes the store suggest this keyword. */
  prefix: string | null;
  /** 1-based position of the keyword in the suggestions for `prefix`. */
  position: number | null;
};

type Autocomplete = { strength: number; prefix: string; position: number } | null;

/**
 * Apple and Google don't publish search volumes, so popularity is estimated from two
 * public signals:
 *
 * 1. Autocomplete (65%). Store suggestions are ordered by how often people
 *    search. A keyword suggested after typing one or two letters is searched
 *    far more than one that only appears once fully typed — or never.
 * 2. Demand (35%). How big the top 10 ranking apps are (median ratings in this
 *    country). Popular searches send lots of downloads to the apps that rank
 *    for them. This also corrects for rare prefixes like "pom" where a keyword
 *    tops the suggestions with little competition.
 */
export async function getPopularity(
  keyword: string,
  country: Country,
  topRatingCounts: Promise<number[]>,
  store: Store = "app",
): Promise<Popularity> {
  const [ac, counts] = await Promise.all([
    getAutocomplete(keyword, country, store),
    topRatingCounts,
  ]);
  if (!ac) return toPopularity(5, null, null);

  const s = [...counts].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const median = s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
  // 100 ratings → 0, 1M ratings → 1, log scale.
  const demand = Math.min(1, Math.max(0, (Math.log10(median + 1) - 2) / 4));

  const score = Math.round(15 + 85 * (0.65 * ac.strength + 0.35 * demand));
  return toPopularity(score, ac.prefix, ac.position);
}

/** Shortest prefix that suggests the keyword, its position there, and a 0–1 strength. */
async function getAutocomplete(
  keyword: string,
  country: Country,
  store: Store,
): Promise<Autocomplete> {
  const chars = Array.from(keyword);
  const full = await getStoreSuggestions(keyword, country, store);
  if (!full.includes(keyword)) return null;

  // Every shorter prefix, fetched in parallel. A prefix ending in a space
  // behaves like the one without it, so those are skipped.
  const prefixes = chars
    .map((_, i) => chars.slice(0, i + 1).join(""))
    .slice(0, -1)
    .filter((p) => !p.endsWith(" "));
  const lists = await Promise.all(
    prefixes.map((p) => getStoreSuggestions(p, country, store).catch(() => [] as string[])),
  );

  let prefix = keyword;
  let index = full.indexOf(keyword);
  for (let i = 0; i < prefixes.length; i++) {
    const at = lists[i].indexOf(keyword);
    if (at !== -1) {
      prefix = prefixes[i];
      index = at;
      break;
    }
  }

  const typed = Array.from(prefix).length;
  // How little you need to type (relative to the keyword, and in absolute
  // letters), discounted by how far down the suggestion list it sits.
  const ease = 0.5 * (1 - (typed - 1) / chars.length) + 0.5 * Math.max(0, 1 - (typed - 1) / 10);
  const rank = 1 - 0.05 * Math.min(index, 9);
  return { strength: ease * rank, prefix, position: index + 1 };
}

function toPopularity(score: number, prefix: string | null, position: number | null): Popularity {
  return { score, label: scoreLabel(score), prefix, position };
}

export function scoreLabel(score: number) {
  return score >= 80 ? "Very high" : score >= 60 ? "High" : score >= 40 ? "Medium" : score >= 20 ? "Low" : "Very low";
}

/** Autocomplete suggestions for a term from either store, normalized, in store order. */
export async function getStoreSuggestions(term: string, country: Country, store: Store) {
  if (store === "play") return (await getPlaySuggestions(term, country)).map(normalizeKeyword);
  return getSuggestions(term, country);
}

async function getSuggestions(term: string, country: Country): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(
    `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(term)}`,
    { headers: { "X-Apple-Store-Front": storefrontHeader(country) } },
  );
  if (!res.ok) throw new Error(`Suggestions failed (${res.status})`);
  const xml = await res.text();
  return [...xml.matchAll(/<key>term<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) =>
    normalizeKeyword(decodeXml(m[1])),
  );
}

export function normalizeKeyword(s: string) {
  return s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function decodeXml(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
