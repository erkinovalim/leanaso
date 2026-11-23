import type { NextRequest } from "next/server";
import { getCountry } from "@/lib/countries";
import { getStoreSuggestions, normalizeKeyword } from "@/lib/popularity";
import { getStore } from "@/lib/stores";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const term = normalizeKeyword(params.get("q") ?? "").slice(0, 100);
  if (!term) return Response.json([]);
  try {
    const country = getCountry(params.get("c") ?? undefined);
    const store = getStore(params.get("s") ?? undefined);
    return Response.json(await getStoreSuggestions(term, country, store));
  } catch {
    return Response.json({ error: "Couldn't load suggestions" }, { status: 502 });
  }
}
