export const SESSION_COOKIE = "wn_session";
export const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function secretBytes(): BufferSource {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required");
  return new TextEncoder().encode(s) as BufferSource;
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64url(sig);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const exp = now + MAX_AGE_SEC * 1000;
  const payload = `ok.${exp}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [ok, expStr, sig] = parts;
  if (ok !== "ok") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${ok}.${expStr}`;
  let expected: string;
  try {
    expected = await sign(payload);
  } catch {
    return false;
  }
  try {
    const a = b64urlToBytes(sig);
    const b = b64urlToBytes(expected);
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function checkCronAuth(header: string | null): boolean {
  const secretEnv = process.env.CRON_SECRET;
  if (!secretEnv || !header) return false;
  const expected = `Bearer ${secretEnv}`;
  const a = new TextEncoder().encode(header);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
