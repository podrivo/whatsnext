import { NextRequest, NextResponse } from "next/server";
import {
  countChildren,
  deleteTodo,
  insertTodo,
  listTodos,
  markParentDoneIfChildrenDone,
  updateTodo,
} from "@/lib/db";
import { decomposeTodo, shouldSkipDecompose } from "@/lib/ai";
import { jsonError } from "@/lib/errors";

export async function GET() {
  try {
    const todos = await listTodos();
    return NextResponse.json({ todos });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const lines: string[] = Array.isArray(body.lines)
      ? body.lines
      : typeof body.title === "string"
        ? [body.title]
        : [];

    const cleaned = lines.map((l: string) => l.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return NextResponse.json({ error: "No titles" }, { status: 400 });
    }

    const created = [];
    const decomposeNotes: {
      title: string;
      status: "skipped" | "split" | "kept" | "error";
      reason: string;
    }[] = [];

    for (const title of cleaned) {
      const todo = await insertTodo({
        title,
        notes: typeof body.notes === "string" ? body.notes : null,
        importance:
          typeof body.importance === "number" ? body.importance : 3,
        estimate_minutes:
          typeof body.estimate_minutes === "number"
            ? body.estimate_minutes
            : null,
      });

      const childCount = await countChildren(todo.id);
      const gate = shouldSkipDecompose({
        title: todo.title,
        notes: todo.notes,
        estimate_minutes: todo.estimate_minutes,
        childCount,
      });

      if (gate.skip) {
        decomposeNotes.push({
          title: todo.title,
          status: "skipped",
          reason: gate.reason,
        });
      } else {
        try {
          const result = await decomposeTodo({
            title: todo.title,
            notes: todo.notes,
            estimate_minutes: todo.estimate_minutes,
            importance: todo.importance,
          });
          if (result.shouldSplit && result.subtasks.length >= 2) {
            for (const st of result.subtasks.slice(0, 5)) {
              await insertTodo({
                title: st.title,
                importance: Math.max(
                  todo.importance,
                  Math.min(5, st.importance ?? todo.importance),
                ),
                estimate_minutes: st.estimateMinutes ?? null,
                parent_id: todo.id,
              });
            }
            decomposeNotes.push({
              title: todo.title,
              status: "split",
              reason: result.reason || `added ${result.subtasks.length} subtasks`,
            });
          } else {
            decomposeNotes.push({
              title: todo.title,
              status: "kept",
              reason: result.reason || "model kept as a single task",
            });
          }
        } catch (decomposeErr) {
          console.error("[api/todos] decompose failed (todo kept)", decomposeErr);
          decomposeNotes.push({
            title: todo.title,
            status: "error",
            reason:
              decomposeErr instanceof Error
                ? decomposeErr.message
                : "decompose failed",
          });
        }
      }
      created.push(todo);
    }

    const todos = await listTodos();
    return NextResponse.json({ created, todos, decompose: decomposeNotes });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const todo = await updateTodo(body.id, {
      ...(typeof body.is_done === "boolean" ? { is_done: body.is_done } : {}),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.importance === "number"
        ? { importance: body.importance }
        : {}),
      ...(body.estimate_minutes !== undefined
        ? { estimate_minutes: body.estimate_minutes }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });

    if (todo.is_done && todo.parent_id) {
      await markParentDoneIfChildrenDone(todo.parent_id);
    }

    const todos = await listTodos();
    return NextResponse.json({ todo, todos });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteTodo(id);
    const todos = await listTodos();
    return NextResponse.json({ todos });
  } catch (e) {
    return jsonError(e);
  }
}
