import { searchApps, type App } from "@/lib/appstore";
import type { Country } from "@/lib/countries";
import { getCompetitiveness } from "@/lib/competitiveness";
import { compact } from "@/lib/format";
import { getPopularity } from "@/lib/popularity";
import { searchPlayApps } from "@/lib/playstore";
import { STORE_NAMES, STORE_OWNERS, type Store } from "@/lib/stores";
import { AppTable } from "./app-table";

export async function Results({
  keyword,
  country,
  store,
}: {
  keyword: string;
  country: Country;
  store: Store;
}) {
  const appsPromise = store === "play" ? searchPlayApps(keyword, country) : searchApps(keyword, country);
  const popularityPromise = getPopularity(
    keyword,
    country,
    appsPromise.then((apps) => apps.slice(0, 10).map((a) => a.ratingCount)),
    store,
  ).catch(() => null);

  let apps: App[];
  try {
    apps = await appsPromise;
  } catch {
    return (
      <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        Couldn&apos;t reach {STORE_NAMES[store]}. Try again in a moment.
      </p>
    );
  }

  const popularity = await popularityPromise;
  const competition = getCompetitiveness(apps);

  return (
    <div className="contents">
      {/* Floats under the sticky search row (112px tall on phones, 60px from sm up). */}
      <section className="sticky top-[112px] z-10 -mx-4 mt-4 grid grid-cols-2 gap-3 bg-background px-4 pt-2 pb-4 sm:top-[60px]">
        <ScoreCard
          title={`Popularity in ${country.name}`}
          score={popularity}
          barClass="bg-blue-600 dark:bg-blue-500"
          note={
            popularity && (
              <>
                {popularity.prefix
                  ? <>{STORE_NAMES[store]} suggests it after typing &ldquo;{popularity.prefix}&rdquo; (#{popularity.position}). </>
                  : <>{STORE_NAMES[store]} doesn&apos;t suggest this keyword, so few people search it. </>}
                Estimated from autocomplete and the size of top-ranking apps; {STORE_OWNERS[store]} doesn&apos;t
                publish exact search counts.
              </>
            )
          }
        />
        <ScoreCard
          title="Competitiveness"
          score={competition}
          barClass="bg-orange-500 dark:bg-orange-400"
          note={
            competition && (
              <>
                Top 10: median {compact(competition.medianRatings)} ratings
                {competition.avgRating ? <>, avg. ★ {competition.avgRating.toFixed(1)}</> : null},{" "}
                {competition.activeCount} of {Math.min(10, apps.length)} updated in the last 90 days.
                Higher means the top results are bigger, better rated and more active, so harder to
                outrank.
              </>
            )
          }
        />
      </section>

      {apps.length ? (
        <div className="mt-2">
          <AppTable apps={apps} country={country.code} store={store} />
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-neutral-500">
          No apps found for &ldquo;{keyword}&rdquo; on {STORE_NAMES[store]} in {country.name}.
        </p>
      )}
    </div>
  );
}

function ScoreCard({
  title,
  score,
  note,
  barClass,
}: {
  title: string;
  score: { score: number; label: string } | null;
  note: React.ReactNode;
  barClass: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Label>{title}</Label>
        {score && <span className="text-sm font-medium">{score.label}</span>}
      </div>
      {score ? (
        <>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${score.score}%` }} />
            </div>
            <span className="text-xs text-neutral-500">/100</span>
          </div>
          {/* Notes are hidden on phones to keep the floating cards short. */}
          <p className="mt-2 hidden text-xs text-neutral-500 sm:block">{note}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">Unavailable right now.</p>
      )}
    </Card>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="mt-8 animate-pulse space-y-6" aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-32 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
        <div className="h-32 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
      </div>
      <div className="h-96 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200 p-4 dark:border-neutral-800 ${className}`}>{children}</div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium text-neutral-500 uppercase">{children}</h2>;
}
