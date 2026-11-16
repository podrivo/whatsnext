import { Resend } from "resend";
import { recommendNext } from "./ai";
import { todayKey } from "./day";
import {
  getPlan,
  getTodo,
  listOpenTodos,
  updateTodo,
  upsertPlan,
} from "./db";
import { sendDailyEmail } from "./mail";

export async function handleInboundEmail(
  emailId: string,
): Promise<{ action: string; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { action: "error", detail: "RESEND_API_KEY missing" };

  const resend = new Resend(apiKey);
  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error || !email) {
    return { action: "error", detail: error?.message ?? "email not found" };
  }

  const allowed = (process.env.WHATSNEXT_TO_EMAIL || "").trim().toLowerCase();
  const from = extractEmail(email.from).toLowerCase();
  if (!allowed || from !== allowed) {
    return { action: "ignored", detail: "unexpected sender" };
  }

  const body = stripQuoted(email.text || stripHtml(email.html || "")).trim();
  const intent = classifyReply(body);
  if (intent === "ignore") {
    return { action: "ignored", detail: "empty or auto-reply" };
  }

  const day = todayKey();
  const plan = await getPlan(day);
  const currentId = plan?.recommended_todo_id ?? null;

  if (intent === "done" && currentId) {
    const todo = await getTodo(currentId);
    if (todo && !todo.is_done) {
      await updateTodo(currentId, { is_done: true });
    }
  }

  const open = await listOpenTodos();
  const excludeIds =
    intent === "skip" && currentId ? [currentId] : [];
  const rec = await recommendNext(open, { excludeIds });

  const newPlan = await upsertPlan({
    day,
    recommended_todo_id: rec.todoId,
    headline: rec.headline,
    rationale: rec.rationale,
    context_summary: rec.contextSummary,
    email_id: null,
  });

  const todo = newPlan.recommended_todo_id
    ? await getTodo(newPlan.recommended_todo_id)
    : null;

  const sent = await sendDailyEmail({ plan: newPlan, todo, force: true });
  if ("error" in sent) {
    return { action: "error", detail: sent.error };
  }

  await upsertPlan({ ...newPlan, email_id: sent.id });
  return { action: intent, detail: sent.id };
}

export function classifyReply(text: string): "done" | "skip" | "ignore" {
  const body = text.trim();
  if (body.length < 2) return "ignore";
  if (
    /^(auto-?reply|out of office|automatic reply)/i.test(body) ||
    /\bunsubscribe\b/i.test(body)
  ) {
    return "ignore";
  }
  if (
    /\b(done|finished|completed|already\s+(did|done)|mark(?:ed)?\s+done)\b/i.test(
      body,
    )
  ) {
    return "done";
  }
  // "too easy", "skip", "another", or any other reply → new suggestion
  return "skip";
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] || from).trim();
}

function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .trim();
}
