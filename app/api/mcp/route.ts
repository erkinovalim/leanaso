import { searchApps, type App } from "@/lib/appstore";
import { getCompetitiveness } from "@/lib/competitiveness";
import { COUNTRIES, type Country } from "@/lib/countries";
import { getInAppPurchases } from "@/lib/iap";
import { searchPlayApps } from "@/lib/playstore";
import {
  getPopularity,
  getStoreSuggestions,
  normalizeKeyword,
} from "@/lib/popularity";
import type { Store } from "@/lib/stores";
import { TranslationNotConfigured, translateToEnglish } from "@/lib/translate";

/**
 * MCP server (Streamable HTTP, stateless, JSON responses) so AI agents can use
 * LeanASO as tools. Connect with:
 *
 *   claude mcp add --transport http leanaso http://localhost:3000/api/mcp
 *
 * If MCP_API_KEY is set, requests must send `Authorization: Bearer <key>`
 * (add `--header "Authorization: Bearer <key>"` to the command above).
 */

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const countryCodes = COUNTRIES.map((c) => c.code);
const common = {
  country: {
    type: "string",
    enum: countryCodes,
    default: "us",
    description: "Two-letter storefront country code (lowercase).",
  },
  store: {
    type: "string",
    enum: ["app", "play"],
    default: "app",
    description: '"app" = Apple App Store, "play" = Google Play.',
  },
};

const TOOLS = [
  {
    name: "search_keyword",
    description:
      "Analyze an ASO keyword in one store and country: popularity score (5–100, estimated from store autocomplete and top-app size; stores don't publish search volumes), competitiveness score (0–100, how hard the top 10 are to outrank) and the apps ranking for it, in store order.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: 'Search term, e.g. "habit tracker".',
        },
        ...common,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 25,
          description: "How many ranked apps to return.",
        },
        include_screenshots: {
          type: "boolean",
          default: false,
          description: "Add screenshot URLs to each app.",
        },
      },
      required: ["keyword"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_suggestions",
    description:
      "The store's autocomplete suggestions for a partial or full term, in the order the store shows them (roughly by search volume). Useful for discovering related keywords.",
    inputSchema: {
      type: "object",
      properties: { term: { type: "string" }, ...common },
      required: ["term"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_in_app_purchases",
    description:
      "An App Store app's top in-app purchases with prices. (Google Play only exposes a price range, already returned by search_keyword as iapRange.)",
    inputSchema: {
      type: "object",
      properties: {
        app_id: {
          type: "string",
          description: "Numeric App Store id, as returned by search_keyword.",
        },
        country: common.country,
      },
      required: ["app_id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "translate_to_english",
    description:
      "Translate texts (e.g. foreign app names, subtitles, suggestions) to English.",
    inputSchema: {
      type: "object",
      properties: {
        texts: { type: "array", items: { type: "string" }, maxItems: 200 },
      },
      required: ["texts"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

class ToolInputError extends Error {}

function argCountry(v: unknown): Country {
  const code = typeof v === "string" ? v.toLowerCase() : "us";
  const c = COUNTRIES.find((x) => x.code === code);
  if (!c)
    throw new ToolInputError(
      `Unknown country "${v}". Use one of: ${countryCodes.join(", ")}.`,
    );
  return c;
}

function argStore(v: unknown): Store {
  if (v === undefined || v === "app") return "app";
  if (v === "play") return "play";
  throw new ToolInputError('store must be "app" or "play".');
}

function argText(v: unknown, name: string) {
  const s = typeof v === "string" ? normalizeKeyword(v).slice(0, 100) : "";
  if (!s) throw new ToolInputError(`${name} is required.`);
  return s;
}

function summarize(a: App, store: Store, screenshots: boolean) {
  return {
    rank: a.rank,
    id: a.id,
    name: a.name,
    subtitle: a.subtitle,
    developer: a.developer,
    url: a.url,
    rating: a.rating,
    ratingCount: a.ratingCount,
    price: a.price,
    hasInAppPurchases: a.hasIap,
    ...(store === "play"
      ? { iapRange: a.iapRange, installs: a.installs }
      : { sizeBytes: a.sizeBytes }),
    category: a.category,
    released: a.released?.slice(0, 10) ?? null,
    updated: a.updated.slice(0, 10),
    daysSinceUpdate: a.daysSinceUpdate,
    ...(screenshots ? { screenshots: a.screenshots } : {}),
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_keyword": {
      const keyword = argText(args.keyword, "keyword");
      const country = argCountry(args.country);
      const store = argStore(args.store);
      const limit = Math.min(200, Math.max(1, Number(args.limit) || 25));
      const appsPromise =
        store === "play"
          ? searchPlayApps(keyword, country)
          : searchApps(keyword, country);
      const popularity = getPopularity(
        keyword,
        country,
        appsPromise.then((apps) => apps.slice(0, 10).map((a) => a.ratingCount)),
        store,
      ).catch(() => null);
      const apps = await appsPromise;
      return {
        keyword,
        country: country.code,
        store,
        popularity: await popularity,
        competitiveness: getCompetitiveness(apps),
        totalApps: apps.length,
        apps: apps
          .slice(0, limit)
          .map((a) => summarize(a, store, args.include_screenshots === true)),
      };
    }
    case "get_suggestions": {
      const term = argText(args.term, "term");
      const country = argCountry(args.country);
      const store = argStore(args.store);
      return {
        term,
        country: country.code,
        store,
        suggestions: await getStoreSuggestions(term, country, store),
      };
    }
    case "get_in_app_purchases": {
      const id = String(args.app_id ?? "");
      if (!/^[1-9]\d{0,15}$/.test(id))
        throw new ToolInputError("app_id must be a numeric App Store id.");
      return {
        app_id: id,
        inAppPurchases: await getInAppPurchases(
          id,
          argCountry(args.country).code,
        ),
      };
    }
    case "translate_to_english": {
      const texts = args.texts;
      if (
        !Array.isArray(texts) ||
        texts.length > 200 ||
        !texts.every((t) => typeof t === "string" && t.length <= 500)
      ) {
        throw new ToolInputError(
          "texts must be an array of up to 200 strings (500 chars each).",
        );
      }
      try {
        return { translations: await translateToEnglish(texts) };
      } catch (e) {
        if (e instanceof TranslationNotConfigured)
          throw new ToolInputError(
            "Translation isn't configured on this server (DEEPL_API_KEY).",
          );
        throw e;
      }
    }
  }
  return undefined;
}

type RpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

async function handle(msg: RpcRequest) {
  const reply = (result: unknown) => ({
    jsonrpc: "2.0",
    id: msg.id ?? null,
    result,
  });
  const fail = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id: msg.id ?? null,
    error: { code, message },
  });

  if (msg?.jsonrpc !== "2.0" || typeof msg.method !== "string")
    return fail(-32600, "Invalid request");
  // Notifications (no id) get no response.
  if (msg.id === undefined) return null;

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "leanaso", version: "0.1.0" },
        instructions:
          "App Store Optimization research for Apple App Store and Google Play. Start with get_suggestions to find candidate keywords, then search_keyword to compare popularity vs competitiveness. Good targets have high popularity and low competitiveness.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name))
        return fail(-32602, `Unknown tool: ${name}`);
      try {
        const result = await callTool(name, args);
        return reply({
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        });
      } catch (e) {
        const text =
          e instanceof ToolInputError
            ? e.message
            : "The store couldn't be reached. Try again in a moment.";
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  const key = process.env.MCP_API_KEY;
  if (key && request.headers.get("authorization") !== `Bearer ${key}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400 },
    );
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length
      ? Response.json(out)
      : new Response(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

// Stateless server: no server-initiated stream and no sessions to end.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
