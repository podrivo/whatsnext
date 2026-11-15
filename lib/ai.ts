import type { Todo } from "./types";
import { inWorkHours, todayKey, weekdayName } from "./day";

/** Groq free tier — https://console.groq.com/keys */
const DEFAULT_BASE = "https://api.groq.com/openai/v1";
// Prefer Qwen: gpt-oss models burn max_tokens on hidden "reasoning" and often return empty content.
const DEFAULT_MODEL = "qwen/qwen3.8-27b";

async function chatJson(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is required (free at console.groq.com/keys)");

  const base = (process.env.LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  // Reasoning models need headroom so content is not truncated to empty
  const tokenBudget = Math.max(maxTokens, 1200);

  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: tokenBudget,
    messages: [
      {
        role: "system",
        content:
          "Reply with a single JSON object only. No markdown fences, no prose before or after.",
      },
      { role: "user", content: prompt },
    ],
  };
  // Lower reasoning if the model supports it (gpt-oss family)
  if (model.includes("gpt-oss")) {
    body.reasoning_effort = "low";
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }

  let data: {
    choices?: {
      message?: { content?: string | null; reasoning?: string | null };
      finish_reason?: string;
    }[];
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`LLM returned non-JSON envelope: ${raw.slice(0, 200)}`);
  }

  const message = data.choices?.[0]?.message;
  const text = message?.content?.trim() || "";
  if (text) return text;

  // Last resort: some reasoning models only leave JSON in the reasoning field
  const fromReasoning = extractJsonObject(message?.reasoning || "");
  if (fromReasoning) return fromReasoning;

  throw new Error(
    `LLM returned empty content (finish=${data.choices?.[0]?.finish_reason ?? "?"}, model=${model})`,
  );
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    JSON.parse(slice);
    return slice;
  } catch {
    return null;
  }
}

export function shouldSkipDecompose(todo: {
  title: string;
  notes?: string | null;
  estimate_minutes?: number | null;
  childCount: number;
}): { skip: boolean; reason: string } {
  if (todo.childCount > 0) {
    return { skip: true, reason: "already has subtasks" };
  }
  if (todo.estimate_minutes != null && todo.estimate_minutes < 25) {
    return { skip: true, reason: "estimate under 25 minutes" };
  }
  const words = todo.title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !todo.notes?.trim()) {
    return { skip: true, reason: "title too short" };
  }
  return { skip: false, reason: "" };
}

type DecomposeResult = {
  shouldSplit: boolean;
  reason: string;
  subtasks: { title: string; estimateMinutes?: number; importance?: number }[];
};

export async function decomposeTodo(todo: {
  title: string;
  notes?: string | null;
  estimate_minutes?: number | null;
  importance: number;
}): Promise<DecomposeResult> {
  const prompt = `Break a todo into real next actions for a personal daily planner.
Return ONLY JSON: {"shouldSplit":boolean,"reason":string,"subtasks":[{"title":string,"estimateMinutes":number,"importance":number}]}

Each subtask must be something worth putting on today's list by itself:
- Concrete, actionable, same language as the task
- At least ~15 minutes of focused work (estimateMinutes >= 15)
- A person could do it as "what's next" without it feeling trivial

Do NOT create subtasks that are:
- Tiny wrap-ups implied by finishing the work (put tools away, guardar ferramentas, limpar a bagunça, tidy up, put ladder back)
- Generic prep that takes under 15 min (get cloth, open window) unless that prep is the hard part
- Restate the parent with different words

Fold prep and cleanup into the main work steps instead of separate items.
Split only when there are 2–4 meaningfully different chunks (e.g. buy materials vs install; clear furniture vs wash ceiling; research vs call vs book).
If the parent is already one sitting of work, set shouldSplit=false.
importance 1-5. Cap 2-4 subtasks.

Task title: ${todo.title}
Notes: ${todo.notes || "(none)"}
Estimate minutes: ${todo.estimate_minutes ?? "unknown"}
Importance: ${todo.importance}`;

  const text = await chatJson(prompt, 600);
  const parsed = parseJson<DecomposeResult>(text, {
    shouldSplit: false,
    reason: "parse_failed",
    subtasks: [],
  });

  const usable = filterSubtasks(parsed.subtasks);
  if (!parsed.shouldSplit || usable.length < 2) {
    return {
      shouldSplit: false,
      reason:
        usable.length < 2 && parsed.shouldSplit
          ? "subtasks too trivial after filter"
          : parsed.reason || "kept as single task",
      subtasks: [],
    };
  }
  return { ...parsed, shouldSplit: true, subtasks: usable };
}

/** Drop micro wrap-ups the model still sneaks in. */
function filterSubtasks(
  subtasks: DecomposeResult["subtasks"],
): DecomposeResult["subtasks"] {
  const trivial =
    /\b(guardar|guardar ferramentas|put away|put back|tidy|arrumar ferramentas|limpar (a )?bagunça|clean up|cleanup|recoger|guardar escada|put tools|wash hands|lavar as m[aã]os)\b/i;

  return subtasks
    .map((s) => ({
      ...s,
      title: (s.title || "").trim(),
      estimateMinutes: s.estimateMinutes ?? null,
    }))
    .filter((s) => s.title.length >= 8)
    .filter((s) => !trivial.test(s.title))
    .filter((s) => s.estimateMinutes == null || s.estimateMinutes >= 15)
    .slice(0, 4)
    .map((s) => ({
      title: s.title,
      estimateMinutes: s.estimateMinutes ?? undefined,
      importance: s.importance,
    }));
}

export async function fetchWeatherLine(): Promise<string> {
  const lat = process.env.WEATHER_LAT;
  const lon = process.env.WEATHER_LON;
  if (!lat || !lon) return "Weather unavailable (set WEATHER_LAT/WEATHER_LON).";
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
  url.searchParams.set("timezone", process.env.TZ || "America/Sao_Paulo");
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return "Weather fetch failed.";
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        precipitation?: number;
        weather_code?: number;
      };
    };
    const c = data.current;
    if (!c) return "Weather unavailable.";
    return `Temp ${c.temperature_2m}°C, precip ${c.precipitation ?? 0}mm, code ${c.weather_code}`;
  } catch {
    return "Weather fetch failed.";
  }
}

export type RecommendResult = {
  todoId: string | null;
  headline: string;
  rationale: string;
  contextSummary: string;
};

export async function recommendNext(
  openTodos: Todo[],
): Promise<RecommendResult> {
  const weather = await fetchWeatherLine();
  const day = todayKey();
  const weekday = weekdayName();
  const work = inWorkHours();

  const candidates = openTodos
    .filter((t) => !t.parent_id || openTodos.some((p) => p.id === t.parent_id))
    .slice(0, 12);

  const contextSummary = [
    `day=${day}`,
    `weekday=${weekday}`,
    `workHours=${work}`,
    `weather=${weather}`,
    `candidates=${candidates.length}`,
  ].join("; ");

  if (candidates.length === 0) {
    return {
      todoId: null,
      headline: "Inbox zero",
      rationale: "No open todos. Add something or enjoy the gap.",
      contextSummary,
    };
  }

  const list = candidates
    .map(
      (t) =>
        `- id=${t.id} | ${t.title} | importance=${t.importance} | est=${t.estimate_minutes ?? "?"}m | parent=${t.parent_id ?? "root"}`,
    )
    .join("\n");

  const prompt = `Pick the single best next todo for right now.
Return ONLY JSON: {"todoId":string,"headline":string,"rationale":string}
Prefer high importance, tasks that fit work-hours bias when workHours=true (work-ish first), and prefer concrete child tasks over vague parents when both are open.
Context: ${contextSummary}
Todos:
${list}`;

  try {
    const text = await chatJson(prompt, 400);
    const parsed = parseJson<{
      todoId?: string;
      headline?: string;
      rationale?: string;
    }>(text, {});
    const match = candidates.find((t) => t.id === parsed.todoId);
    if (match) {
      return {
        todoId: match.id,
        headline: parsed.headline?.trim() || match.title,
        rationale: parsed.rationale?.trim() || "Best fit for today.",
        contextSummary,
      };
    }
  } catch (e) {
    console.error("[recommend]", e);
  }

  const fallback = [...candidates].sort(
    (a, b) => b.importance - a.importance,
  )[0];
  return {
    todoId: fallback.id,
    headline: fallback.title,
    rationale: "Highest importance open task (model fallback).",
    contextSummary,
  };
}

function parseJson<T>(text: string, fallback: T): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return fallback;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}
