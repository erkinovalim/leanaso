import { cacheLife } from "next/cache";

export type InAppPurchase = { name: string; price: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/**
 * In-app purchases from the app's App Store product page, priced in that
 * country's currency. Apple lists up to 10, most popular first. The
 * "In-App Purchases" section is the only one made of name/price pairs, so it's
 * found by shape rather than by its (localized) heading.
 */
export async function getInAppPurchases(id: string, country: string): Promise<InAppPurchase[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(`https://apps.apple.com/${country}/app/id${id}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`App page failed (${res.status})`);
  const json = (await res.text()).match(
    /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) throw new Error("App page format changed");

  type Item = { $kind?: string; leadingText?: string; trailingText?: string };
  const sections: { items?: Item[] }[] =
    JSON.parse(json).data?.[0]?.data?.shelfMapping?.information?.items ?? [];
  return sections
    .flatMap((s) => s.items ?? [])
    .filter((i) => i.$kind === "textPair" && i.leadingText && i.trailingText)
    .map((i) => ({ name: i.leadingText!, price: i.trailingText! }));
}
