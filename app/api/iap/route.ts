import type { NextRequest } from "next/server";
import { getCountry } from "@/lib/countries";
import { getInAppPurchases } from "@/lib/iap";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  if (!/^[1-9]\d{0,15}$/.test(id)) {
    return Response.json({ error: "Invalid app id" }, { status: 400 });
  }
  try {
    const iaps = await getInAppPurchases(id, getCountry(params.get("c") ?? undefined).code);
    return Response.json(iaps);
  } catch {
    return Response.json({ error: "Couldn't load in-app purchases" }, { status: 502 });
  }
}
