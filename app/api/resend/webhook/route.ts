import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Resend webhook not configured" },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const id =
    req.headers.get("webhook-id") ?? req.headers.get("svix-id") ?? "";
  const timestamp =
    req.headers.get("webhook-timestamp") ??
    req.headers.get("svix-timestamp") ??
    "";
  const signature =
    req.headers.get("webhook-signature") ??
    req.headers.get("svix-signature") ??
    "";

  const resend = new Resend(apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Ack only for now — reply → new-task handling comes next.
  if (event.type === "email.received") {
    console.log("resend email.received", {
      emailId: event.data.email_id,
      from: event.data.from,
      to: event.data.to,
      subject: event.data.subject,
    });
  }

  return NextResponse.json({ ok: true });
}
