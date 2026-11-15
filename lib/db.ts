import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { DailyPlan, Todo } from "./types";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (key.startsWith("sb_publishable_") || key.includes("anon")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY looks like a publishable key. In Supabase → Settings → API → Secret keys, copy a secret key (sb_secret_… or legacy service_role eyJ…), not a publishable key.",
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function throwIf(error: { message: string; code?: string; details?: string; hint?: string } | null) {
  if (error) throw error;
}

export async function listTodos(): Promise<Todo[]> {
  const { data, error } = await db()
    .from("todos")
    .select("*")
    .order("created_at", { ascending: true });
  throwIf(error);
  return (data ?? []) as Todo[];
}

export async function listOpenTodos(): Promise<Todo[]> {
  const { data, error } = await db()
    .from("todos")
    .select("*")
    .eq("is_done", false)
    .order("importance", { ascending: false });
  throwIf(error);
  return (data ?? []) as Todo[];
}

export async function getTodo(id: string): Promise<Todo | null> {
  const { data, error } = await db()
    .from("todos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIf(error);
  return data as Todo | null;
}

export async function insertTodo(input: {
  title: string;
  notes?: string | null;
  importance?: number;
  estimate_minutes?: number | null;
  due_at?: string | null;
  parent_id?: string | null;
}): Promise<Todo> {
  const { data, error } = await db()
    .from("todos")
    .insert({
      title: input.title.trim(),
      notes: input.notes ?? null,
      importance: input.importance ?? 3,
      estimate_minutes: input.estimate_minutes ?? null,
      due_at: input.due_at ?? null,
      parent_id: input.parent_id ?? null,
    })
    .select("*")
    .single();
  throwIf(error);
  return data as Todo;
}

export async function updateTodo(
  id: string,
  patch: Partial<
    Pick<
      Todo,
      | "title"
      | "notes"
      | "importance"
      | "estimate_minutes"
      | "due_at"
      | "is_done"
    >
  >,
): Promise<Todo> {
  const { data, error } = await db()
    .from("todos")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  throwIf(error);
  return data as Todo;
}

export async function deleteTodo(id: string): Promise<void> {
  const { error } = await db().from("todos").delete().eq("id", id);
  throwIf(error);
}

export async function countOpenChildren(parentId: string): Promise<number> {
  const { count, error } = await db()
    .from("todos")
    .select("*", { count: "exact", head: true })
    .eq("parent_id", parentId)
    .eq("is_done", false);
  throwIf(error);
  return count ?? 0;
}

export async function countChildren(parentId: string): Promise<number> {
  const { count, error } = await db()
    .from("todos")
    .select("*", { count: "exact", head: true })
    .eq("parent_id", parentId);
  throwIf(error);
  return count ?? 0;
}

export async function markParentDoneIfChildrenDone(
  parentId: string,
): Promise<void> {
  const open = await countOpenChildren(parentId);
  if (open === 0) {
    await updateTodo(parentId, { is_done: true });
  }
}

export async function getPlan(day: string): Promise<DailyPlan | null> {
  const { data, error } = await db()
    .from("daily_plans")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  throwIf(error);
  return data as DailyPlan | null;
}

export async function upsertPlan(
  plan: Omit<DailyPlan, "created_at"> & { created_at?: string },
): Promise<DailyPlan> {
  const { data, error } = await db()
    .from("daily_plans")
    .upsert(
      {
        day: plan.day,
        recommended_todo_id: plan.recommended_todo_id,
        headline: plan.headline,
        rationale: plan.rationale,
        context_summary: plan.context_summary,
        email_id: plan.email_id ?? null,
      },
      { onConflict: "day" },
    )
    .select("*")
    .single();
  throwIf(error);
  return data as DailyPlan;
}
