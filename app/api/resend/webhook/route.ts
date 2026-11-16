import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { handleInboundEmail } from "@/lib/inbound";

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

  if (event.type === "email.received") {
    try {
      const result = await handleInboundEmail(event.data.email_id);
      console.log("resend inbound", event.data.email_id, result);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      console.error("resend inbound failed", e);
      // Ack so Resend does not retry forever on app bugs
      return NextResponse.json({
        ok: false,
        error: e instanceof Error ? e.message : "inbound failed",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
