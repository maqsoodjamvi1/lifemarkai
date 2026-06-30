/**
 * Verifies LifemarkAI's OpenRouter catalogs against OpenRouter's live model API.
 * This keeps UI pickers, smart routing, and defaults from drifting into stale
 * model IDs.
 */
import {
  OPENROUTER_MODEL_IDS,
  getOpenRouterModelLabel,
} from "../lib/ai/openrouter-models";
import { MODEL_CATALOG } from "../lib/ai/model-catalog";
import {
  BALANCED_CODING_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CODING_MODEL,
  FAST_CODING_MODEL,
  REASONING_MODEL,
} from "../lib/ai/model-defaults";
import { get } from "node:https";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, data: Record<string, unknown> = {}) {
  if (ok) passed++;
  else failed++;
  console.log(JSON.stringify({ message: name, ok, ...data }));
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

async function fetchOpenRouterModels(): Promise<{ data?: Array<{ id?: string; name?: string }> }> {
  const url = "https://openrouter.ai/api/v1/models";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { data?: Array<{ id?: string; name?: string }> };
    } catch (error) {
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  return await new Promise((resolve, reject) => {
    const request = get(url, { headers: { Accept: "application/json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as { data?: Array<{ id?: string; name?: string }> });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => {
      request.destroy(new Error("OpenRouter catalog request timed out"));
    });
  });
}

async function main() {
  const uiDupes = duplicates(OPENROUTER_MODEL_IDS);
  check("UI OpenRouter catalog has no duplicate ids", uiDupes.length === 0, {
    duplicates: uiDupes,
  });
  check("UI OpenRouter catalog exposes 40+ models", OPENROUTER_MODEL_IDS.length >= 40, {
    count: OPENROUTER_MODEL_IDS.length,
  });

  const smartIds = MODEL_CATALOG.map((model) => model.id);
  const smartMissingFromUi = smartIds.filter((id) => !OPENROUTER_MODEL_IDS.includes(id));
  const hasSmartEnvOverrides = Object.keys(process.env).some((key) =>
    key.startsWith("OPENROUTER_MODEL__"),
  );
  check(
    "Smart routing catalog models are visible in UI catalog",
    hasSmartEnvOverrides || smartMissingFromUi.length === 0,
    { missing: smartMissingFromUi, envOverrides: hasSmartEnvOverrides },
  );

  const payload = await fetchOpenRouterModels();
  const liveIds = new Set((payload.data ?? []).map((model) => model.id).filter(Boolean));
  check("OpenRouter live model API returned model list", liveIds.size > 0, {
    liveCount: liveIds.size,
  });

  const requiredIds = [
    ...OPENROUTER_MODEL_IDS,
    ...smartIds,
    DEFAULT_CODING_MODEL,
    FAST_CODING_MODEL,
    BALANCED_CODING_MODEL,
    DEFAULT_CHAT_MODEL,
    REASONING_MODEL,
  ].filter((id): id is string => typeof id === "string" && id.includes("/"));

  const requiredUnique = [...new Set(requiredIds)];
  const missingLive = requiredUnique.filter((id) => !liveIds.has(id));
  check("All configured OpenRouter chat models are live", missingLive.length === 0, {
    count: requiredUnique.length,
    missing: missingLive,
  });

  check("Default coding router label resolves", getOpenRouterModelLabel(DEFAULT_CODING_MODEL) !== DEFAULT_CODING_MODEL, {
    model: DEFAULT_CODING_MODEL,
    label: getOpenRouterModelLabel(DEFAULT_CODING_MODEL),
  });

  console.log(JSON.stringify({ message: "summary", passed, failed }));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  check("verify-openrouter-catalog crashed", false, {
    error: error instanceof Error ? error.message : String(error),
  });
  console.log(JSON.stringify({ message: "summary", passed, failed }));
  process.exit(1);
});
