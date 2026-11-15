import { Resend } from "resend";
import type { DailyPlan, Todo } from "./types";

export async function sendDailyEmail(opts: {
  plan: DailyPlan;
  todo: Todo | null;
}): Promise<{ id: string } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "WhatsNext <onboarding@resend.dev>";
  const to = process.env.WHATSNEXT_TO_EMAIL;
  if (!apiKey) return { error: "RESEND_API_KEY missing" };
  if (!to) return { error: "WHATSNEXT_TO_EMAIL missing" };

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "";
  const title = opts.todo?.title ?? opts.plan.headline;
  const estimate = opts.todo?.estimate_minutes
    ? `~${opts.todo.estimate_minutes} min`
    : "";
  const link = appUrl
    ? `<p><a href="${appUrl}">Open WhatsNext</a></p>`
    : "";

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;">WhatsNext</p>
      <h1 style="font-size: 22px; margin: 8px 0 12px;">${escapeHtml(opts.plan.headline)}</h1>
      <p><strong>${escapeHtml(title)}</strong>${estimate ? ` · ${escapeHtml(estimate)}` : ""}</p>
      <p style="color: #444;">${escapeHtml(opts.plan.rationale)}</p>
      ${link}
    </div>
  `.trim();

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: `Next: ${opts.plan.headline}`,
      html,
    },
    { idempotencyKey: `whatsnext-daily/${opts.plan.day}` },
  );

  if (error) return { error: error.message };
  if (!data?.id) return { error: "No email id returned" };
  return { id: data.id };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
