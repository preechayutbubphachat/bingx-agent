import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "obgate_auth";

function sha256hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function signHmacBase64url(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function makeToken(secret: string, expMs: number) {
  const payload = { v: 1, exp: Date.now() + expMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signHmacBase64url(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const secret = process.env.AUTH_COOKIE_SECRET ?? "";
  const passHash = process.env.AUTH_PASSWORD_HASH ?? "";

  if (!secret || !passHash) {
    return NextResponse.json({ ok: false, error: "AUTH env not set" }, { status: 500 });
  }

  const ok = typeof password === "string" && safeEqualHex(sha256hex(password), passHash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 });
  }

  const token = makeToken(secret, 7 * 24 * 60 * 60 * 1000);
  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return res;
}
