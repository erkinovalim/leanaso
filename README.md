# LeanASO

A deliberately small App Store keyword tool. It does four things:

1. Searches a keyword in any of 51 App Store countries.
2. Shows the ranking apps in App Store order, with rating, ratings count, price, category, release date, last update and size.
3. Estimates how popular the keyword is (5–100).
4. Scores how competitive it is: how hard the top results would be to outrank (0–100).

No database and no accounts. The only key is optional: a free [DeepL API key](https://www.deepl.com/pro-api) powers the "Translate to English" button (titles, subtitles and in-app purchase names). The free plan allows 500,000 characters a month.

```bash
npm install
echo "DEEPL_API_KEY=your-key" > .env.local   # optional, for translation
npm run dev
```

Open http://localhost:3000, or link straight to a search: `/?q=habit+tracker&c=us`.

## Where the data comes from

| What | Source |
| --- | --- |
| Ranks 1–~12 and subtitles | The App Store's web search page (`apps.apple.com/{country}/iphone/search`) |
| Ranks ~13–200 | The App Store search endpoint (`MZStore.woa/wa/search`), which returns the full ordered list of ~250 results in one response |
| App metrics | iTunes Lookup API, in parallel batches of 50 |
| In-app purchases (row expand) | The app's App Store product page, top 10 with local prices, via `/api/iap`, cached a day |
| Translation | DeepL API (`/api/translate`), batches of 50, cached for weeks |
| Popularity | App Store autocomplete (`MZSearchHints`), plus the ranking apps' ratings counts |

Both App Store endpoints take an `X-Apple-Store-Front` header (`lib/countries.ts`). The US store needs the explicit `-1` (en-US) language to match the iPhone App Store, and other stores reject that language ID, so they use their default. If the search endpoint fails, ranking falls back to the iTunes Search API (50 results, approximate order). Responses are cached in memory (`'use cache'`): searches for an hour and autocomplete for a day.

## How popularity is estimated

Apple doesn't publish search counts. The only official number is the 5–100 popularity score in Apple Search Ads, which requires an Ads account. LeanASO estimates a similar 5–100 score from public signals (see `lib/popularity.ts`):

- **Autocomplete, 65%.** App Store suggestions are ordered by search volume. The score depends on how few letters you have to type before the keyword is suggested, and how high it appears in that list.
- **Demand, 35%.** The median ratings count of the top 10 apps in that country, on a log scale. Keywords that get a lot of searches send a lot of downloads to the apps that rank for them.
- If the App Store never suggests the keyword, the score is 5.

Treat the score as a way to compare keywords, not as an absolute search count.

## How competitiveness is scored

A 0–100 score for how established the top 10 results are (see `lib/competitiveness.ts`). Each app's strength is

```
size × (0.5 + 0.25 × quality + 0.25 × activity)
```

- **Size:** ratings count in that country, on a log scale (100 → 0, 1M → 1). Ratings are the best public proxy for downloads, so a small app scores low however good it is.
- **Quality:** average rating, from 3.5★ (0) to 5★ (1).
- **Activity:** updated in the last 90 days → 1, fading to 0 at two years.

The ten strengths are averaged, weighting higher ranks more (1/√rank). A high score means the top results are big, well rated and actively maintained, so they're hard to beat. A high-popularity, low-competitiveness keyword is the opportunity.
