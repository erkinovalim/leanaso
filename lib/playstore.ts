import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { MAX_SCREENSHOTS, type App } from "./appstore";
import type { Country } from "./countries";

/*
 * Google Play has no public API, so this reads the same pages and endpoints
 * play.google.com uses. Page data sits in `AF_initDataCallback({key: 'ds:N',
 * … data: [...]})` blocks as positional arrays; the indexes below were mapped
 * by hand and will need updating if Google changes the page.
 */

const BASE = "https://play.google.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

// Language Play is browsed in per country, where it isn't the country's main
// language (English is the usual Play language in these).
const LANG_OVERRIDES: Record<string, string> = {
  in: "en",
  pk: "en",
  ph: "en",
  my: "en",
  no: "no",
  tw: "zh-TW",
  hk: "zh-HK",
};

function lang(country: Country) {
  return (
    LANG_OVERRIDES[country.code] ??
    new Intl.Locale(`und-${country.code.toUpperCase()}`).maximize().language
  );
}

/**
 * Results for a keyword in a country, in Google Play rank order, with metrics.
 * Play's search page lists ~20–30 apps (no further pages on the web), with
 * the top app as a separate "featured" card for brand searches. Ratings
 * count, dates and in-app purchases come from each app's details page.
 */
export async function searchPlayApps(term: string, country: Country): Promise<App[]> {
  const ids = await getRanking(term, country.code, lang(country));
  const details = await Promise.all(
    ids.map((id) => getDetails(id, country.code, lang(country)).catch(() => null)),
  );
  await connection(); // "updated N days ago" must be computed per request
  const now = Date.now();

  // Rank is the Play position, so an app whose page can't be read leaves a gap.
  return ids.flatMap((id, i) => {
    const d = details[i];
    if (!d) return [];
    return [{ ...d, rank: i + 1, daysSinceUpdate: Math.floor((now - Date.parse(d.updated)) / 864e5) }];
  });
}

type Details = Omit<App, "rank" | "daysSinceUpdate">;

async function getRanking(term: string, gl: string, hl: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `${BASE}/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${hl}&gl=${gl}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error(`Google Play search failed (${res.status})`);
  const html = await res.text();

  for (const data of dataBlocks(html)) {
    const sections: unknown[][] | undefined = data?.[0]?.[1];
    if (!Array.isArray(sections)) continue;
    const ids: string[] = [];
    for (const s of sections) {
      if (!Array.isArray(s)) continue;
      // Featured top result (brand searches): its id is only in its link.
      if (s[23]) {
        const m = JSON.stringify(s[23]).match(/\/store\/apps\/details\?id=([\w.]+)/);
        if (m) ids.push(m[1]);
      }
      const items = (s[22] as unknown[][] | undefined)?.[0];
      for (const item of Array.isArray(items) ? items : []) {
        const id = (item as unknown[][][])?.[0]?.[0]?.[0];
        if (typeof id === "string") ids.push(id);
      }
    }
    if (ids.length) return [...new Set(ids)];
  }
  return []; // no results block: the search matched no apps
}

async function getDetails(id: string, gl: string, hl: string): Promise<Details | null> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `${BASE}/store/apps/details?id=${encodeURIComponent(id)}&hl=${hl}&gl=${gl}`,
    { headers: { "User-Agent": UA } },
  );
  if (res.status === 404) return null; // not available in this country
  if (!res.ok) throw new Error(`Google Play app page failed (${res.status})`);

  // The details block is the one shaped [_, [_, _, [ [name], … ]]].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any[] | undefined = dataBlocks(await res.text())
    .map((d) => d?.[1]?.[2])
    .find((x) => Array.isArray(x) && typeof x[0]?.[0] === "string" && x[77]?.[0] === id);
  if (!a) throw new Error("Google Play app page format changed");

  const offer = a[57]?.[0]?.[0]?.[0]?.[0]?.[1]?.[0];
  const released = seconds(a[10]?.[1]?.[0]);
  const updated = seconds(a[145]?.[0]?.[1]?.[0]) ?? released ?? new Date().toISOString();
  const ratingCount: number = a[51]?.[2]?.[1] ?? 0;
  const icon: string | undefined = a[95]?.[0]?.[3]?.[2];
  return {
    id,
    name: a[0][0],
    // Short description, Play's closest thing to a subtitle. It's HTML.
    subtitle: a[73]?.[0]?.[1] ? htmlToText(a[73][0][1]) : null,
    developer: a[68]?.[0] ?? a[37]?.[0] ?? "",
    icon: icon ? `${icon}=s128` : "",
    url: `${BASE}/store/apps/details?id=${id}`,
    rating: ratingCount ? (a[51]?.[0]?.[1] ?? null) : null,
    ratingCount,
    price: offer && offer[0] > 0 && offer[2] ? offer[2] : "Free",
    category: a[79]?.[0]?.[0]?.[0] ?? "",
    released,
    updated,
    sizeBytes: null, // Play no longer shows download size
    installs: a[13]?.[1] ?? null,
    hasIap: Boolean(a[19]?.[0]),
    iapRange: a[19]?.[0] ?? null,
    // Each is [_, _, [width, height], [_, _, url]]; "=h600" asks for 600px tall (sharp at 2x).
    screenshots: ((a[78]?.[0] ?? []) as unknown[][])
      .map((s) => (s?.[3] as unknown[] | undefined)?.[2])
      .filter((u): u is string => typeof u === "string")
      .slice(0, MAX_SCREENSHOTS)
      .map((u) => `${u}=h600`),
  };
}

/** Google Play autocomplete for a term, in the order Play shows it (up to 5). */
export async function getPlaySuggestions(term: string, country: Country): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const req = JSON.stringify([[["IJ4APc", JSON.stringify([[null, [term], [10], [2], 4]])]]]);
  const res = await fetch(
    `${BASE}/_/PlayStoreUi/data/batchexecute?rpcids=IJ4APc&hl=${lang(country)}&gl=${country.code}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ "f.req": req }),
    },
  );
  if (!res.ok) throw new Error(`Google Play suggestions failed (${res.status})`);
  // Response starts with an anti-JSON-hijacking line: )]}'
  const outer: unknown[][] = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ""));
  const payload = outer.find((r) => r[0] === "wrb.fr" && r[1] === "IJ4APc")?.[2];
  if (typeof payload !== "string") return [];
  const list: unknown[][] | undefined = JSON.parse(payload)?.[0]?.[0];
  return (list ?? []).map((s) => s[0]).filter((s): s is string => typeof s === "string");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dataBlocks(html: string): any[] {
  return [...html.matchAll(/AF_initDataCallback\(\{key: 'ds:\d+'[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function htmlToText(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function seconds(s: unknown) {
  return typeof s === "number" ? new Date(s * 1000).toISOString() : null;
}
