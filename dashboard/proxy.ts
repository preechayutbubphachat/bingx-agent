import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_NAME = "obgate_auth";

function isPublicPath(pathname: string) {
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/public-health") return true;
  if (pathname.startsWith("/api/internal/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/assets/trading-agent-hq/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots")) return true;
  if (pathname.startsWith("/sitemap")) return true;
  return false;
}

function padBase64(b64: string) {
  const mod = b64.length % 4;
  return mod === 0 ? b64 : b64 + "=".repeat(4 - mod);
}

function base64urlToBytes(b64url: string) {
  const b64 = padBase64(b64url.replace(/-/g, "+").replace(/_/g, "/"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }

  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Base64url(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToBase64url(new Uint8Array(sigBuf));
}

function constantTimeEq(a: string, b: string) {
  if (a.length !== b.length) return false;

  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return out === 0;
}

async function verifyToken(token: string, secret: string) {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;

  const expected = await hmacSha256Base64url(secret, payloadB64);
  if (!constantTimeEq(expected, sig)) return false;

  try {
    const payloadJson = new TextDecoder().decode(base64urlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as { exp?: number; v?: number };

    if (!payload?.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_COOKIE_SECRET?.trim() ?? "";
  if (!secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  const ok = token ? await verifyToken(token, secret) : false;

  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
