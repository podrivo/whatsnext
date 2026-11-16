import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const withRobots = (res: NextResponse) => {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  };

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/daily") ||
    pathname.startsWith("/api/resend/webhook")
  ) {
    return withRobots(NextResponse.next());
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) {
    if (pathname.startsWith("/api/")) {
      return withRobots(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return withRobots(NextResponse.redirect(url));
  }

  return withRobots(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
