import Link from "next/link";
import { Suspense } from "react";
import { getCountry } from "@/lib/countries";
import { normalizeKeyword } from "@/lib/popularity";
import { STORE_NAMES, getStore, type Store } from "@/lib/stores";
import { SearchForm } from "./search-form";
import { Results, ResultsSkeleton } from "./results";
import { TranslationProvider } from "./translation";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <TranslationProvider>
        <Suspense
          fallback={
            <>
              <Header />
              <SearchForm />
            </>
          }
        >
          <Search searchParams={searchParams} />
        </Suspense>
      </TranslationProvider>
    </main>
  );
}

async function Search({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { q, c, s } = await searchParams;
  const keyword = normalizeKeyword(String(q ?? "")).slice(0, 100);
  const country = getCountry(String(c ?? ""));
  const store = getStore(String(s ?? ""));
  const key = `${store}:${country.code}:${keyword}`;

  return (
    <>
      <Header keyword={keyword} country={country.code} store={store} />
      <SearchForm key={`form:${key}`} keyword={keyword} country={country.code} store={store} />
      {keyword ? (
        <Suspense key={`results:${key}`} fallback={<ResultsSkeleton />}>
          <Results keyword={keyword} country={country} store={store} />
        </Suspense>
      ) : (
        <p className="mt-16 text-center text-sm text-neutral-500">
          Search a keyword to see its popularity and the apps ranking for it.
        </p>
      )}
    </>
  );
}

/** Title, with the App Store / Google Play switch on the right. */
function Header({
  keyword = "",
  country = "us",
  store = "app",
}: {
  keyword?: string;
  country?: string;
  store?: Store;
}) {
  // Switching keeps the current search and country.
  const href = (s: Store) => {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (keyword || country !== "us") params.set("c", country);
    if (s === "play") params.set("s", "play");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="shrink-0 text-xl font-semibold tracking-tight">
        Lean<span className="text-blue-600 dark:text-blue-400">ASO</span>
      </h1>
      <nav
        aria-label="Store"
        className="flex rounded-lg border border-neutral-300 p-0.5 text-sm dark:border-neutral-700"
      >
        {(["app", "play"] as const).map((s) => (
          <Link
            key={s}
            href={href(s)}
            prefetch={false}
            aria-current={s === store ? "page" : undefined}
            className={`rounded-md px-3 py-1 font-medium whitespace-nowrap ${
              s === store
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {STORE_NAMES[s]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
