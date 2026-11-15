import type { Todo } from "./types";
import { inWorkHours, todayKey, weekdayName } from "./day";

/** Groq free tier — https://console.groq.com/keys */
const DEFAULT_BASE = "https://api.groq.com/openai/v1";
// llama-3.3-70b-versatile is enterprise-only now; gpt-oss-20b is on the free rate-limit table
const DEFAULT_MODEL = "openai/gpt-oss-20b";

async function chatJson(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is required (free at console.groq.com/keys)");

  const base = (process.env.LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You reply with valid JSON only. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM returned empty content");
  return text;
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
  const prompt = `You break work into smaller next actions.
Return ONLY JSON: {"shouldSplit":boolean,"reason":string,"subtasks":[{"title":string,"estimateMinutes":number,"importance":number}]}
Rules:
- Prefer shouldSplit=true when the task has clear prep / do / cleanup (or gather tools / do work / put away) steps — including household chores.
- shouldSplit=false only for a single atomic action with no useful smaller steps.
- Cap 2-5 subtasks. importance 1-5. Titles imperative, short, same language as the task.

Task title: ${todo.title}
Notes: ${todo.notes || "(none)"}
Estimate minutes: ${todo.estimate_minutes ?? "unknown"}
Importance: ${todo.importance}`;

  const text = await chatJson(prompt, 600);
  return parseJson<DecomposeResult>(text, {
    shouldSplit: false,
    reason: "parse_failed",
    subtasks: [],
  });
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
