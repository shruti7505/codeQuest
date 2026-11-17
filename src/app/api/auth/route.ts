import { randomInt, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, gte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, trustedDevices, users, verificationTokens } from "@/db/schema";
import { createSession, createTrustedDevice, DEVICE_COOKIE, ensureSeed, getCurrentUser, hashToken, isTrustedDevice, makeToken, publicUser, SESSION_COOKIE, setDeviceCookie, setSessionCookie } from "@/lib/server";
import { sendEmail, sendSms } from "@/lib/delivery";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const today = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };

export async function POST(request: NextRequest) {
  try {
    await ensureSeed();
    const action = request.nextUrl.searchParams.get("action");
    const body = await request.json().catch(() => ({}));
    if (action === "signup") {
      const parsed = z.object({ name: z.string().trim().min(2).max(60), handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,25}$/), email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(72) }).safeParse(body);
      if (!parsed.success) return fail("Enter a valid name, username, email, and a password of at least 8 characters.");
      const { name, handle, email, password } = parsed.data;
      const [existing] = await db.select().from(users).where(or(eq(users.email, email), eq(users.handle, handle)));
      if (existing) return fail("That email or username is already in use.", 409);
      const [user] = await db.insert(users).values({ id: randomUUID(), name, handle, email, passwordHash: await bcrypt.hash(password, 12), avatar: randomInt(0, 9) }).returning();
      const token = await createSession(user.id, request);
      const response = NextResponse.json({ user: publicUser(user, true) }, { status: 201 });
      setSessionCookie(response, token);
      setDeviceCookie(response, await createTrustedDevice(user.id, request));
      return response;
    }
    if (action === "login") {
      const parsed = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(72) }).safeParse(body);
      if (!parsed.success) return fail("Enter your email or username and password.");
      const identifier = parsed.data.identifier.toLowerCase();
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier), eq(users.handle, identifier))).limit(1);
      if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail("Invalid credentials.", 401);
      if (user.isSuspended) return fail("This account has been suspended.", 403);
      const trusted = await isTrustedDevice(user.id, request.cookies.get(DEVICE_COOKIE)?.value);
      if (!trusted && process.env.REQUIRE_LOGIN_OTP === "true") {
        const recent = await db.select().from(verificationTokens).where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "login"), gte(verificationTokens.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
        if (recent.length >= 5) return fail("Too many verification requests. Please try again later.", 429);
        const code = randomInt(100000, 1000000).toString();
        if (user.email) await sendEmail(user.email, "Verify your CodeQuest sign-in", `Your CodeQuest sign-in code is ${code}. It expires in 10 minutes. If this wasn't you, reset your password.`);
        else if (user.phone) await sendSms(user.phone, `Your CodeQuest sign-in code is ${code}. It expires in 10 minutes.`);
        else return fail("A registered email or phone is required for device verification.");
        const [challenge] = await db.insert(verificationTokens).values({ userId: user.id, purpose: "login", tokenHash: hashToken(`${user.id}:${code}`), payload: body.rememberDevice ? "remember" : "", expiresAt: new Date(Date.now() + 10 * 60 * 1000) }).returning();
        return NextResponse.json({ requiresOtp: true, challengeId: challenge.id, message: "We sent a verification code to your registered contact." });
      }
      const token = await createSession(user.id, request);
      if (!trusted && user.email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) sendEmail(user.email, "New sign-in to CodeQuest", `A new device signed in to your CodeQuest account on ${new Date().toUTCString()}. If this wasn't you, reset your password and revoke your sessions.`).catch(console.error);
      const response = NextResponse.json({ user: publicUser(user, true) });
      setSessionCookie(response, token);
      if (!trusted && body.rememberDevice) setDeviceCookie(response, await createTrustedDevice(user.id, request));
      return response;
    }
    if (action === "login-verify") {
      const parsed = z.object({ challengeId: z.number().int().positive(), code: z.string().regex(/^\d{6}$/) }).safeParse(body);
      if (!parsed.success) return fail("Enter the six-digit verification code.");
      const [challenge] = await db.select().from(verificationTokens).where(and(eq(verificationTokens.id, parsed.data.challengeId), eq(verificationTokens.purpose, "login"), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date()))).limit(1);
      if (!challenge || challenge.attempts >= 5) return fail("This code has expired. Please sign in again.");
      if (challenge.tokenHash !== hashToken(`${challenge.userId}:${parsed.data.code}`)) {
        await db.update(verificationTokens).set({ attempts: challenge.attempts + 1 }).where(eq(verificationTokens.id, challenge.id));
        return fail("That code is not correct.");
      }
      const [user] = await db.select().from(users).where(eq(users.id, challenge.userId));
      if (!user || user.isSuspended) return fail("This account is unavailable.", 403);
      await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, challenge.id));
      const token = await createSession(user.id, request);
      const response = NextResponse.json({ user: publicUser(user, true) });
      setSessionCookie(response, token);
      if (challenge.payload === "remember") setDeviceCookie(response, await createTrustedDevice(user.id, request));
      return response;
    }
    if (action === "logout") {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      const response = NextResponse.json({ ok: true });
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
      return response;
    }
    if (action === "forgot") {
      const identifier = z.string().trim().min(3).max(254).safeParse(body.identifier);
      if (!identifier.success) return fail("Enter your registered email or phone number.");
      const value = identifier.data.toLowerCase();
      const [user] = await db.select().from(users).where(or(eq(users.email, value), eq(users.phone, value))).limit(1);
      if (!user || !user.passwordHash) return NextResponse.json({ ok: true, message: "If an account exists, reset instructions will be sent." });
      const [previous] = await db.select().from(verificationTokens).where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "reset"), gte(verificationTokens.createdAt, today()))).limit(1);
      if (previous) return fail("You can use this option only one time per day.", 429);
      const token = makeToken();
      const base = process.env.APP_URL || request.nextUrl.origin;
      const link = `${base}/forgot-password?token=${token}`;
      if (value.includes("@") && user.email) await sendEmail(user.email, "Reset your CodeQuest password", `Use this link to reset your password (expires in 30 minutes): ${link}\n\nIf you didn't request this, you can ignore this message.`);
      else if (user.phone) await sendSms(user.phone, `CodeQuest password reset (expires in 30 minutes): ${link}`);
      else return NextResponse.json({ ok: true, message: "If an account exists, reset instructions will be sent." });
      await db.insert(verificationTokens).values({ userId: user.id, purpose: "reset", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
      return NextResponse.json({ ok: true, message: "If an account exists, reset instructions will be sent." });
    }
    if (action === "reset") {
      const parsed = z.object({ token: z.string().length(64), password: z.string().min(8).max(72) }).safeParse(body);
      if (!parsed.success) return fail("Choose a password of at least 8 characters.");
      const [verification] = await db.select().from(verificationTokens).where(and(eq(verificationTokens.tokenHash, hashToken(parsed.data.token)), eq(verificationTokens.purpose, "reset"), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date()))).limit(1);
      if (!verification) return fail("This reset link is invalid or has expired.");
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash: await bcrypt.hash(parsed.data.password, 12) }).where(eq(users.id, verification.userId));
        await tx.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, verification.id));
        await tx.delete(sessions).where(eq(sessions.userId, verification.userId));
        await tx.delete(trustedDevices).where(eq(trustedDevices.userId, verification.userId));
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "language-request") {
      const user = await getCurrentUser();
      if (!user) return fail("Please sign in first.", 401);
      const locale = z.enum(["en", "es", "hi", "pt", "zh", "fr"]).safeParse(body.locale);
      if (!locale.success) return fail("Choose a supported language.");
      const recent = await db.select().from(verificationTokens).where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "language"), gte(verificationTokens.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
      if (recent.length >= 5) return fail("Too many verification requests. Please try again later.", 429);
      const code = randomInt(100000, 1000000).toString();
      if (locale.data === "fr") {
        if (!user.email) return fail("Add a registered email to your profile first.");
        await sendEmail(user.email, "CodeQuest language verification", `Your CodeQuest verification code is ${code}. It expires in 10 minutes.`);
      } else {
        if (!user.phone) return fail("Add a registered phone number to your profile first.");
        await sendSms(user.phone, `Your CodeQuest verification code is ${code}. It expires in 10 minutes.`);
      }
      await db.insert(verificationTokens).values({ userId: user.id, purpose: "language", tokenHash: hashToken(`${user.id}:${code}`), payload: locale.data, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      return NextResponse.json({ ok: true, message: locale.data === "fr" ? "A verification code was sent to your email." : "A verification code was sent to your phone." });
    }
    if (action === "language-verify") {
      const user = await getCurrentUser();
      if (!user) return fail("Please sign in first.", 401);
      const code = z.string().regex(/^\d{6}$/).safeParse(body.code);
      if (!code.success) return fail("Enter the six-digit code.");
      const [verification] = await db.select().from(verificationTokens).where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.purpose, "language"), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date()))).orderBy(desc(verificationTokens.createdAt)).limit(1);
      if (!verification || verification.attempts >= 5) return fail("This code has expired. Request a new one.");
      if (verification.tokenHash !== hashToken(`${user.id}:${code.data}`)) {
        await db.update(verificationTokens).set({ attempts: verification.attempts + 1 }).where(eq(verificationTokens.id, verification.id));
        return fail("That code is not correct.");
      }
      await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, verification.id));
      const [updated] = await db.update(users).set({ locale: verification.payload }).where(eq(users.id, user.id)).returning();
      return NextResponse.json({ user: publicUser(updated, true) });
    }
    return fail("Not found.", 404);
  } catch (error) {
    console.error("Auth", error);
    const message = error instanceof Error && (error.message.includes("configured") || error.message.includes("send the")) ? error.message : "Something went wrong. Please try again.";
    return fail(message, 500);
  }
}
