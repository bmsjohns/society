import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Everything needs a signed-in Prologue device except webhooks (own auth), the cron
// (CRON_SECRET) and the sign-in page.
const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/webhooks/(.*)", "/api/cron/(.*)", "/manifest.webmanifest", "/sw.js"]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production") return NextResponse.next();
  return withClerk(req, ev);
}

export const config = {
  matcher: ["/((?!_next|fonts/|brand/|icons/|.*\\.(?:png|svg|otf|ttf|ico|webp)$).*)", "/(api|trpc)(.*)"],
};
