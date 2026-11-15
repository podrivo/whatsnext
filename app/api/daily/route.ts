import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/auth";
import { getPlan, getTodo, listOpenTodos, upsertPlan } from "@/lib/db";
import { recommendNext } from "@/lib/ai";
import { todayKey } from "@/lib/day";
import { sendDailyEmail } from "@/lib/mail";
import { jsonError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const force =
      req.nextUrl.searchParams.get("force") === "1" ||
      (await req
        .clone()
        .json()
        .then((b: { force?: boolean }) => b?.force === true)
        .catch(() => false));

    const day = todayKey();
    let plan = await getPlan(day);
    if (!plan) {
      const open = await listOpenTodos();
      const rec = await recommendNext(open);
      plan = await upsertPlan({
        day,
        recommended_todo_id: rec.todoId,
        headline: rec.headline,
        rationale: rec.rationale,
        context_summary: rec.contextSummary,
        email_id: null,
      });
    }

    const todo = plan.recommended_todo_id
      ? await getTodo(plan.recommended_todo_id)
      : null;

    const result = await sendDailyEmail({ plan, todo, force });
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, detail: "Resend send failed" },
        { status: 502 },
      );
    }

    plan = await upsertPlan({
      ...plan,
      email_id: result.id,
    });

    return NextResponse.json({ ok: true, emailId: result.id, plan });
  } catch (e) {
    return jsonError(e);
  }
}
