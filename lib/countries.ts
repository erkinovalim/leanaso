// App Store storefronts. `sf` is Apple's storefront ID, needed for the
// autocomplete (popularity) endpoint; `code` is used everywhere else.
export const COUNTRIES = [
  { code: "us", name: "United States", sf: 143441 },
  { code: "gb", name: "United Kingdom", sf: 143444 },
  { code: "ca", name: "Canada", sf: 143455 },
  { code: "au", name: "Australia", sf: 143460 },
  { code: "nz", name: "New Zealand", sf: 143461 },
  { code: "ie", name: "Ireland", sf: 143449 },
  { code: "de", name: "Germany", sf: 143443 },
  { code: "fr", name: "France", sf: 143442 },
  { code: "es", name: "Spain", sf: 143454 },
  { code: "it", name: "Italy", sf: 143450 },
  { code: "nl", name: "Netherlands", sf: 143452 },
  { code: "be", name: "Belgium", sf: 143446 },
  { code: "ch", name: "Switzerland", sf: 143459 },
  { code: "at", name: "Austria", sf: 143445 },
  { code: "pt", name: "Portugal", sf: 143453 },
  { code: "se", name: "Sweden", sf: 143456 },
  { code: "no", name: "Norway", sf: 143457 },
  { code: "dk", name: "Denmark", sf: 143458 },
  { code: "fi", name: "Finland", sf: 143447 },
  { code: "pl", name: "Poland", sf: 143478 },
  { code: "cz", name: "Czechia", sf: 143489 },
  { code: "hu", name: "Hungary", sf: 143482 },
  { code: "ro", name: "Romania", sf: 143487 },
  { code: "gr", name: "Greece", sf: 143448 },
  { code: "tr", name: "Türkiye", sf: 143480 },
  { code: "ua", name: "Ukraine", sf: 143492 },
  { code: "ru", name: "Russia", sf: 143469 },
  { code: "il", name: "Israel", sf: 143491 },
  { code: "ae", name: "United Arab Emirates", sf: 143481 },
  { code: "sa", name: "Saudi Arabia", sf: 143479 },
  { code: "eg", name: "Egypt", sf: 143516 },
  { code: "za", name: "South Africa", sf: 143472 },
  { code: "ng", name: "Nigeria", sf: 143561 },
  { code: "in", name: "India", sf: 143467 },
  { code: "pk", name: "Pakistan", sf: 143477 },
  { code: "id", name: "Indonesia", sf: 143476 },
  { code: "my", name: "Malaysia", sf: 143473 },
  { code: "sg", name: "Singapore", sf: 143464 },
  { code: "th", name: "Thailand", sf: 143475 },
  { code: "vn", name: "Vietnam", sf: 143471 },
  { code: "ph", name: "Philippines", sf: 143474 },
  { code: "jp", name: "Japan", sf: 143462 },
  { code: "kr", name: "South Korea", sf: 143466 },
  { code: "cn", name: "China", sf: 143465 },
  { code: "tw", name: "Taiwan", sf: 143470 },
  { code: "hk", name: "Hong Kong", sf: 143463 },
  { code: "br", name: "Brazil", sf: 143503 },
  { code: "mx", name: "Mexico", sf: 143468 },
  { code: "ar", name: "Argentina", sf: 143505 },
  { code: "cl", name: "Chile", sf: 143483 },
  { code: "co", name: "Colombia", sf: 143501 },
] as const;

export type Country = (typeof COUNTRIES)[number];

export function getCountry(code: string | undefined): Country {
  return COUNTRIES.find((c) => c.code === code?.toLowerCase()) ?? COUNTRIES[0];
}

/**
 * X-Apple-Store-Front header value. The US store needs an explicit language
 * (1 = en-US) to match what the iPhone App Store returns; other stores reject
 * foreign language IDs, so they get their default language.
 */
export function storefrontHeader(c: Country) {
  return c.code === "us" ? `${c.sf}-1,29` : `${c.sf},29`;
}
