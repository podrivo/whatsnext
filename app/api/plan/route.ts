import { NextRequest, NextResponse } from "next/server";
import {
  getPlan,
  listOpenTodos,
  upsertPlan,
  getTodo,
  updateTodo,
} from "@/lib/db";
import { recommendNext } from "@/lib/ai";
import { todayKey } from "@/lib/day";
import { jsonError } from "@/lib/errors";

export async function GET() {
  try {
    const day = todayKey();
    let plan = await getPlan(day);
    if (!plan) {
      plan = await computeAndStore(false);
    }
    const todo = plan.recommended_todo_id
      ? await getTodo(plan.recommended_todo_id)
      : null;
    return NextResponse.json({ plan, todo, day });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action === "done") {
      const day = todayKey();
      const plan = await getPlan(day);
      if (plan?.recommended_todo_id) {
        const todo = await getTodo(plan.recommended_todo_id);
        if (todo && !todo.is_done) {
          await updateTodo(todo.id, { is_done: true });
        }
      }
      const open = await listOpenTodos();
      const next = open[0] ?? null;
      const updated = await upsertPlan({
        day,
        recommended_todo_id: next?.id ?? null,
        headline: next?.title ?? "Inbox zero",
        rationale: next
          ? "Next open task after you marked the last one done."
          : "Nothing left open.",
        context_summary: plan?.context_summary ?? "",
        email_id: plan?.email_id ?? null,
      });
      return NextResponse.json({
        plan: updated,
        todo: next,
        day,
      });
    }

    const force = action === "refresh" || body.force === true;
    const plan = await computeAndStore(force);
    const todo = plan.recommended_todo_id
      ? await getTodo(plan.recommended_todo_id)
      : null;
    return NextResponse.json({ plan, todo, day: plan.day });
  } catch (e) {
    return jsonError(e);
  }
}

async function computeAndStore(force: boolean) {
  const day = todayKey();
  if (!force) {
    const existing = await getPlan(day);
    if (existing) return existing;
  }
  const open = await listOpenTodos();
  const rec = await recommendNext(open);
  return upsertPlan({
    day,
    recommended_todo_id: rec.todoId,
    headline: rec.headline,
    rationale: rec.rationale,
    context_summary: rec.contextSummary,
    email_id: null,
  });
}
