import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { storefrontHeader, type Country } from "./countries";

export type App = {
  rank: number;
  /** App Store: numeric ID as a string. Google Play: package name. */
  id: string;
  name: string;
  subtitle: string | null;
  developer: string;
  icon: string;
  url: string;
  rating: number | null;
  ratingCount: number;
  price: string;
  category: string;
  /** null when the store doesn't say (Play pre-release apps). */
  released: string | null;
  updated: string;
  daysSinceUpdate: number;
  sizeBytes: number | null;
  /** Google Play only: lower bound of the installs bracket (e.g. 5,000,000 for "5M+"). */
  installs: number | null;
  /** null if the store's in-app purchase info couldn't be reached. */
  hasIap: boolean | null;
  /** Google Play only: the price range Play shows instead of individual items. */
  iapRange: string | null;
  /** Store screenshot image URLs, phone ones first; at most MAX_SCREENSHOTS. */
  screenshots: string[];
};

export const MAX_SCREENSHOTS = 8;

type ItunesApp = {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  trackViewUrl: string;
  averageUserRating?: number;
  userRatingCount?: number;
  formattedPrice?: string;
  primaryGenreName: string;
  releaseDate: string;
  currentVersionReleaseDate?: string;
  fileSizeBytes?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const MAX_RESULTS = 200;

/**
 * Results for a keyword in a country, in App Store rank order, with metrics.
 *
 * Ranking comes from two App Store sources, merged:
 * - The App Store's web search page: exact order and subtitles, top ~12.
 * - The App Store's search endpoint (the one the old iTunes client used):
 *   the full ordered list of ~250 results, used for every rank after that.
 * Metrics come from the iTunes Lookup API. If the search endpoint fails, the
 * iTunes Search API (50 results, approximate order) is used instead.
 */
export async function searchApps(term: string, country: Country): Promise<App[]> {
  const cc = country.code;
  const [top, deep] = await Promise.all([
    getTopRanking(term, cc).catch(() => []),
    getFullRanking(term, country).catch(() => null),
  ]);
  const fallback = deep ? [] : await itunesSearch(term, cc);

  const ids = [
    ...new Set([...top.map((r) => r.id), ...(deep ?? fallback.map((a) => a.id))]),
  ].slice(0, MAX_RESULTS);

  const details = new Map(fallback.map((a) => [a.id, a]));
  const missing = ids.filter((id) => !details.has(id));
  const chunks = Array.from({ length: Math.ceil(missing.length / 50) }, (_, i) =>
    missing.slice(i * 50, i * 50 + 50),
  );
  const [lists, iapFlags] = await Promise.all([
    Promise.all(chunks.map((c) => itunesLookup(c, cc).catch(() => []))),
    getIapFlags(ids, cc).catch(() => null),
  ]);
  for (const list of lists) {
    for (const a of list) details.set(a.id, a);
  }

  const subtitles = new Map(top.map((r) => [r.id, r.subtitle]));
  await connection(); // "updated N days ago" must be computed per request
  const now = Date.now();

  // Rank is the App Store position, so an app the lookup can't return
  // (pulled, region-locked) leaves a gap rather than shifting everyone up.
  return ids.flatMap((id, i) => {
    const a = details.get(id);
    if (!a) return [];
    return [
      {
        ...a,
        id: String(id),
        rank: i + 1,
        subtitle: subtitles.get(id) ?? null,
        daysSinceUpdate: Math.floor((now - Date.parse(a.updated)) / 864e5),
        hasIap: iapFlags ? iapFlags.has(id) : null,
        installs: null,
        iapRange: null,
      },
    ];
  });
}

type AppDetails = Omit<
  App,
  "id" | "rank" | "subtitle" | "daysSinceUpdate" | "hasIap" | "installs" | "iapRange" | "released"
> & { id: number; released: string };

function toDetails(a: ItunesApp): AppDetails {
  return {
    id: a.trackId,
    name: a.trackName,
    developer: a.artistName,
    icon: a.artworkUrl100,
    url: a.trackViewUrl.split("?")[0],
    rating: a.userRatingCount ? (a.averageUserRating ?? null) : null,
    ratingCount: a.userRatingCount ?? 0,
    price: a.formattedPrice ?? "Free",
    category: a.primaryGenreName,
    released: a.releaseDate,
    updated: a.currentVersionReleaseDate ?? a.releaseDate,
    sizeBytes: a.fileSizeBytes ? Number(a.fileSizeBytes) : null,
    // iPad-only apps have no iPhone screenshots.
    screenshots: (a.screenshotUrls?.length ? a.screenshotUrls : (a.ipadScreenshotUrls ?? [])).slice(
      0,
      MAX_SCREENSHOTS,
    ),
  };
}

async function itunesSearch(term: string, country: string): Promise<AppDetails[]> {
  "use cache";
  cacheLife("hours");
  const url = `https://itunes.apple.com/search?entity=software&limit=50&country=${country}&term=${encodeURIComponent(term)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`App Store search failed (${res.status})`);
  return (await res.json()).results.map(toDetails);
}

async function itunesLookup(ids: number[], country: string): Promise<AppDetails[]> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `https://itunes.apple.com/lookup?entity=software&country=${country}&id=${ids.join(",")}`,
  );
  if (!res.ok) throw new Error(`App Store lookup failed (${res.status})`);
  return (await res.json()).results.filter((r: ItunesApp) => r.trackId).map(toDetails);
}

/**
 * Which apps offer in-app purchases, from Apple's store-platform lockup lookup
 * (the iTunes API doesn't say). It returns `hasInAppPurchases: true` for apps
 * that have them and omits the field otherwise; 100 IDs per request.
 */
async function getIapFlags(ids: number[], country: string): Promise<Set<number>> {
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
    ids.slice(i * 100, i * 100 + 100),
  );
  const lists = await Promise.all(chunks.map((c) => iapLookup(c, country)));
  return new Set(lists.flat());
}

async function iapLookup(ids: number[], country: string): Promise<number[]> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `https://uclient-api.itunes.apple.com/WebObjects/MZStorePlatform.woa/wa/lookup?version=2&p=lockup&caller=web&cc=${country}&id=${ids.join(",")}`,
  );
  if (!res.ok) throw new Error(`Lockup lookup failed (${res.status})`);
  const data: { results: Record<string, { hasInAppPurchases?: boolean }> } = await res.json();
  return Object.entries(data.results)
    .filter(([, v]) => v.hasInAppPurchases)
    .map(([id]) => Number(id));
}

/** Full ordered result list (~250 app IDs) from the App Store search endpoint. */
async function getFullRanking(term: string, country: Country): Promise<number[]> {
  "use cache";
  cacheLife("hours");
  const url = `https://search.itunes.apple.com/WebObjects/MZStore.woa/wa/search?clientApplication=Software&media=software&term=${encodeURIComponent(term)}`;
  const headers = { "X-Apple-Store-Front": storefrontHeader(country) };
  // This endpoint normally answers in ~1s but occasionally stalls. Without a
  // timeout a stalled request hangs the cache fill until it's abandoned, and
  // the results quietly drop to the 50-app fallback. Time out and retry once.
  const attempt = async () => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`App Store search failed (${res.status})`);
    return res.json();
  };
  const data = await attempt().catch(attempt);
  const bubble = (data.pageData?.bubbles ?? []).find(
    (b: { name: string }) => b.name === "software",
  );
  if (!bubble) return []; // no results for this term
  return bubble.results.map((r: { id: string }) => Number(r.id));
}

/** Exact organic rank order from the App Store's web search page. */
async function getTopRanking(
  term: string,
  country: string,
): Promise<{ id: number; subtitle: string | null }[]> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `https://apps.apple.com/${country}/iphone/search?term=${encodeURIComponent(term)}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error(`App Store page failed (${res.status})`);
  const html = await res.text();
  const json = html.match(
    /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) throw new Error("App Store page format changed");

  const out: { id: number; subtitle: string | null }[] = [];
  const seen = new Set<number>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const lockup = o.lockup as { adamId?: string; subtitle?: string } | undefined;
    if (typeof o.$kind === "string" && /^App.*SearchResult$/.test(o.$kind) && lockup?.adamId) {
      const id = Number(lockup.adamId);
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ id, subtitle: lockup.subtitle || null });
      }
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(json));
  if (!out.length) throw new Error("No ranked results found");
  return out;
}
