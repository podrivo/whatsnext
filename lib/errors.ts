import { NextResponse } from "next/server";

export type PublicError = {
  error: string;
  code?: string;
  detail?: string;
};

export function toPublicError(e: unknown): PublicError {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const message =
      typeof o.message === "string"
        ? o.message
        : e instanceof Error
          ? e.message
          : null;
    if (message) {
      const detailParts: string[] = [];
      if (typeof o.details === "string" && o.details) detailParts.push(o.details);
      if (typeof o.hint === "string" && o.hint) detailParts.push(`Hint: ${o.hint}`);
      if (typeof o.status === "number") detailParts.push(`status ${o.status}`);
      return {
        error: message,
        code: typeof o.code === "string" ? o.code : undefined,
        detail: detailParts.length ? detailParts.join(" · ") : undefined,
      };
    }
  }
  if (e instanceof Error) return { error: e.message };
  return { error: String(e) };
}

export function jsonError(e: unknown, status = 500) {
  const body = toPublicError(e);
  console.error("[api]", body.error, body.code ?? "", body.detail ?? "", e);
  return NextResponse.json(body, { status });
}
