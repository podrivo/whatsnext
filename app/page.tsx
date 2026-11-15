"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import type { DailyPlan, Todo } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [planTodo, setPlanTodo] = useState<Todo | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [todosRes, planRes] = await Promise.all([
        fetch("/api/todos"),
        fetch("/api/plan"),
      ]);
      if (todosRes.status === 401 || planRes.status === 401) {
        router.replace("/login");
        return;
      }
      const todosData = await todosRes.json();
      const planData = await planRes.json();
      if (!todosRes.ok) throw new Error(formatApiError(todosData, "Todos failed"));
      if (!planRes.ok) throw new Error(formatApiError(planData, "Plan failed"));
      setTodos(todosData.todos ?? []);
      setPlan(planData.plan ?? null);
      setPlanTodo(planData.todo ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const roots = useMemo(
    () => todos.filter((t) => !t.parent_id),
    [todos],
  );
  const childrenOf = useCallback(
    (id: string) => todos.filter((t) => t.parent_id === id),
    [todos],
  );

  async function addTodos(e: FormEvent) {
    e.preventDefault();
    const lines = draft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, "Add failed"));
      setTodos(data.todos ?? []);
      setDraft("");
      if (Array.isArray(data.decompose) && data.decompose.length > 0) {
        const summary = data.decompose
          .map(
            (d: { title: string; status: string; reason: string }) =>
              `“${d.title}”: ${d.status} — ${d.reason}`,
          )
          .join("\n");
        setError(null);
        setInfo(summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(todo: Todo) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, is_done: !todo.is_done }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, "Update failed"));
      setTodos(data.todos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeTodo(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/todos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, "Delete failed"));
      setTodos(data.todos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function planAction(action: "done" | "refresh") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data, "Plan failed"));
      setPlan(data.plan ?? null);
      setPlanTodo(data.todo ?? null);
      if (action === "done") {
        const todosRes = await fetch("/api/todos");
        const todosData = await todosRes.json();
        if (todosRes.ok) setTodos(todosData.todos ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
  }

  return (
    <main className={styles.main}>
      <div className={styles.topBar}>
        <p className={styles.eyebrow}>WhatsNext</p>
        <button type="button" className={styles.linkBtn} onClick={logout}>
          Log out
        </button>
      </div>

      <h1 className={styles.title}>What&apos;s next</h1>
      <p className={styles.lede}>
        One daily recommendation from your list, weather, and the day of the
        week.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {info && <p className={styles.info}>{info}</p>}

      <section className={styles.card}>
        {loading ? (
          <p className={styles.empty}>Loading…</p>
        ) : plan ? (
          <>
            <h2 className={styles.headline}>{plan.headline}</h2>
            <p className={styles.rationale}>{plan.rationale}</p>
            {planTodo && (
              <p className={styles.meta}>
                {planTodo.title}
                {planTodo.estimate_minutes
                  ? ` · ~${planTodo.estimate_minutes} min`
                  : ""}
                {` · importance ${planTodo.importance}`}
              </p>
            )}
            <div className={styles.row}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy || !planTodo}
                onClick={() => planAction("done")}
              >
                Done
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => planAction("refresh")}
              >
                Refresh plan
              </button>
            </div>
          </>
        ) : (
          <p className={styles.empty}>
            No plan yet. Add todos, then refresh — or wait for the morning
            email.
          </p>
        )}
      </section>

      <h2 className={styles.sectionTitle}>Todos</h2>
      <form className={styles.form} onSubmit={addTodos}>
        <label className={styles.label}>
          Add or paste (one per line)
          <textarea
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"Ship weekly update\nCall dentist\n…"}
            disabled={busy}
          />
        </label>
        <button className={styles.primary} type="submit" disabled={busy}>
          Add
        </button>
      </form>

      <ul className={styles.list}>
        {roots.length === 0 && (
          <li className={styles.empty}>No todos yet.</li>
        )}
        {roots.map((todo) => (
          <TodoBranch
            key={todo.id}
            todo={todo}
            childTodos={childrenOf(todo.id)}
            busy={busy}
            onToggle={toggleDone}
            onRemove={removeTodo}
          />
        ))}
      </ul>
    </main>
  );
}

function formatApiError(
  data: { error?: string; detail?: string; code?: string },
  fallback: string,
): string {
  const parts = [data.error || fallback];
  if (data.code) parts.push(`(${data.code})`);
  if (data.detail) parts.push(data.detail);
  return parts.join(" — ");
}

function TodoBranch({
  todo,
  childTodos,
  busy,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  childTodos: Todo[];
  busy: boolean;
  onToggle: (t: Todo) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <li
        className={`${styles.item} ${todo.is_done ? styles.itemDone : ""}`}
      >
        <input
          className={styles.check}
          type="checkbox"
          checked={todo.is_done}
          disabled={busy}
          onChange={() => onToggle(todo)}
        />
        <div className={styles.itemBody}>
          <div className={styles.itemTitle}>{todo.title}</div>
          <div className={styles.itemMeta}>
            importance {todo.importance}
            {todo.estimate_minutes ? ` · ${todo.estimate_minutes}m` : ""}
          </div>
        </div>
        <button
          type="button"
          className={styles.danger}
          disabled={busy}
          onClick={() => onRemove(todo.id)}
        >
          Delete
        </button>
      </li>
      {childTodos.map((child) => (
        <li
          key={child.id}
          className={`${styles.item} ${styles.child} ${child.is_done ? styles.itemDone : ""}`}
        >
          <input
            className={styles.check}
            type="checkbox"
            checked={child.is_done}
            disabled={busy}
            onChange={() => onToggle(child)}
          />
          <div className={styles.itemBody}>
            <div className={styles.itemTitle}>{child.title}</div>
            <div className={styles.itemMeta}>
              importance {child.importance}
              {child.estimate_minutes ? ` · ${child.estimate_minutes}m` : ""}
            </div>
          </div>
          <button
            type="button"
            className={styles.danger}
            disabled={busy}
            onClick={() => onRemove(child.id)}
          >
            Delete
          </button>
        </li>
      ))}
    </>
  );
}
