import "server-only";
import { createHash, randomBytes } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { comments, follows, notifications, posts, reputationEvents, sessions, trustedDevices, users } from "@/db/schema";

export const DEMO_ID = "demo-alex";
export const SESSION_COOKIE = "cq_session";
export const DEVICE_COOKIE = "cq_device";
const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const seedMembers = [
  { id: DEMO_ID, name: "Alex Morgan", handle: "alexmorgan", headline: "Frontend Developer", bio: "Building things for the web, one line at a time.", avatar: 0, reputation: 1280 },
  { id: "member-sarah", name: "Sarah Chen", handle: "sarahchen", headline: "Frontend Developer", bio: "React, design systems, and a really good cup of coffee.", avatar: 1, reputation: 4820 },
  { id: "member-david", name: "David Kim", handle: "davidkim", headline: "Full-stack Developer", bio: "Building tools for the open web.", avatar: 2, reputation: 3640 },
  { id: "member-priya", name: "Priya Sharma", handle: "priyasharma", headline: "Software Engineer", bio: "Making the web a little more accessible.", avatar: 3, reputation: 6210 },
  { id: "member-james", name: "James Wilson", handle: "jameswilson", headline: "Developer Advocate", bio: "I like code and sharing what I learn.", avatar: 4, reputation: 2950 },
  { id: "member-aisha", name: "Aisha Johnson", handle: "aishaj", headline: "UI Engineer", bio: "Creating delightful digital experiences.", avatar: 5, reputation: 5120 },
  { id: "member-raj", name: "Raj Patel", handle: "rajpatel", headline: "Backend Developer", bio: "APIs, databases and good documentation.", avatar: 6, reputation: 2380 },
  { id: "member-emma", name: "Emma Wilson", handle: "emmaw", headline: "Product Designer", bio: "At the intersection of design and code.", avatar: 7, reputation: 3100 },
  { id: "member-marcus", name: "Marcus Johnson", handle: "marcusj", headline: "Full-stack Developer", bio: "Learning in public and building in the open.", avatar: 8, reputation: 3940 },
];

async function seedDatabase() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO_ID)).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    await tx.insert(users).values(seedMembers).onConflictDoNothing();
    const seededPosts = await tx.insert(posts).values([
      { authorId: "member-sarah", type: "question", title: "How do you handle state management in a growing React app?", body: "I've been working on a React project that's starting to grow, and prop drilling is getting a little out of hand. 😅 What state management solutions do you reach for, and why?", tags: ["react", "javascript", "help"], seedLikes: 128, seedComments: 22, views: 1200, createdAt: ago(2) },
      { authorId: "member-marcus", type: "project", title: "I finally launched my first open-source project! 🚀", body: "After months of learning and building, I finally shipped something I'm really proud of. It's a little tool to help developers stay focused and organized. Would love to hear what you think!", tags: ["showcase", "opensource", "buildinpublic"], seedLikes: 96, seedComments: 17, views: 860, createdAt: ago(5) },
      { authorId: "member-priya", type: "update", title: "A small CSS trick that made my layouts so much easier", body: "A friendly reminder that you can use clamp() for fluid typography without a bunch of media queries. It's been a game changer for my responsive designs!", code: "font-size: clamp(1rem, 2.5vw, 2rem);", tags: ["css", "webdev", "tips"], seedLikes: 84, seedComments: 12, views: 720, createdAt: ago(8) },
      { authorId: "member-david", type: "question", title: "What are your favorite tools for debugging Node.js?", body: "I'm putting together a better debugging workflow for my team. What tools or techniques have saved you the most time?", tags: ["nodejs", "backend", "discuss"], seedLikes: 62, seedComments: 16, views: 540, createdAt: ago(17) },
      { authorId: "member-aisha", type: "update", title: "Things I wish I knew when I started coding", body: "You don't need to know everything. Build the small thing, ask the question, and keep showing up. The community is here for you. 💜", tags: ["beginners", "learning", "community"], seedLikes: 212, seedComments: 31, views: 2400, createdAt: ago(24) },
      { authorId: "member-raj", type: "question", title: "How do you structure a REST API for a side project?", body: "I'm moving beyond tutorials and would love to learn how other developers organize their routes, services, and database models.", tags: ["api", "nodejs", "beginners"], seedLikes: 45, seedComments: 9, views: 430, createdAt: ago(30) },
      { authorId: "member-emma", type: "project", title: "Made a tiny accessibility checklist for developers", body: "I turned my favorite accessibility checks into a simple resource. Hope it helps someone make the web a little better today!", tags: ["accessibility", "opensource", "showcase"], seedLikes: 76, seedComments: 11, views: 660, createdAt: ago(48) },
      { authorId: "member-james", type: "question", title: "What's one developer tool you can't live without?", body: "Looking to upgrade my workflow this month. Share the extensions, apps, or little utilities you swear by!", tags: ["tools", "discuss", "productivity"], seedLikes: 103, seedComments: 27, views: 980, createdAt: ago(72) },
    ]).returning();
    await tx.insert(comments).values([
      { postId: seededPosts[0].id, authorId: "member-david", body: "I usually start with React Context and move to Zustand when things get more complex. It keeps the setup really simple!", createdAt: ago(1.5) },
      { postId: seededPosts[0].id, authorId: "member-priya", body: "It depends on the kind of state! For server state, TanStack Query has been wonderful for our team.", createdAt: ago(0.8) },
      { postId: seededPosts[1].id, authorId: "member-aisha", body: "This is such a great milestone. Congratulations on shipping it! 🎉", createdAt: ago(3) },
    ]);
    await tx.insert(follows).values([
      { followerId: DEMO_ID, followingId: "member-sarah" },
      { followerId: DEMO_ID, followingId: "member-aisha" },
    ]).onConflictDoNothing();
    await tx.insert(notifications).values([
      { userId: DEMO_ID, actorId: "member-sarah", message: "started following you. Say hello!", createdAt: ago(3) },
      { userId: DEMO_ID, actorId: "member-priya", message: "welcomed you to the community.", createdAt: ago(20) },
    ]);
    await tx.insert(reputationEvents).values({ userId: DEMO_ID, delta: 1280, reason: "Your community reputation", createdAt: ago(168) });
  });
}

const globalSeed = globalThis as typeof globalThis & { __codeQuestSeed?: Promise<void> };
export function ensureSeed() {
  if (!globalSeed.__codeQuestSeed) {
    globalSeed.__codeQuestSeed = seedDatabase().catch((error) => {
      globalSeed.__codeQuestSeed = undefined;
      throw error;
    });
  }
  return globalSeed.__codeQuestSeed;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const makeToken = () => randomBytes(32).toString("hex");

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [result] = await db.select({ user: users, session: sessions }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!result || result.user.isSuspended) return null;
  const inactiveDays = Math.min(90, Math.max(1, Number(process.env.SESSION_INACTIVE_DAYS) || 14));
  if (result.session.lastActiveAt.getTime() < Date.now() - inactiveDays * 86400000) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    return null;
  }
  if (result.session.lastActiveAt.getTime() < Date.now() - 5 * 60000) await db.update(sessions).set({ lastActiveAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
  return result.user;
}

export async function createSession(userId: string, request: Request) {
  const token = makeToken();
  const userAgent = (request.headers.get("user-agent") || "Unknown device").slice(0, 500);
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Unknown browser";
  const os = /Windows/i.test(userAgent) ? "Windows" : /Android/i.test(userAgent) ? "Android" : /iPhone|iPad/i.test(userAgent) ? "iOS" : /Mac OS/i.test(userAgent) ? "macOS" : /Linux/i.test(userAgent) ? "Linux" : "Unknown OS";
  const device = /iPad|Tablet/i.test(userAgent) ? "Tablet" : /Mobile|iPhone|Android/i.test(userAgent) ? "Mobile" : "Desktop";
  const location = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "Unknown").slice(0, 100);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, userAgent, browser, os, device, location, ip: (request.headers.get("x-forwarded-for")?.split(",")[0] || "Unknown").slice(0, 100), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
  return token;
}

export async function isTrustedDevice(userId: string, deviceToken?: string) {
  if (!deviceToken) return false;
  const [device] = await db.select().from(trustedDevices).where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.tokenHash, hashToken(deviceToken)), gt(trustedDevices.expiresAt, new Date()))).limit(1);
  return !!device;
}

export async function createTrustedDevice(userId: string, request: Request) {
  const token = makeToken();
  await db.insert(trustedDevices).values({ tokenHash: hashToken(token), userId, userAgent: (request.headers.get("user-agent") || "Unknown device").slice(0, 500), expiresAt: new Date(Date.now() + 90 * 86400000) });
  return token;
}

export function setDeviceCookie(response: { cookies: { set: (name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number }) => unknown } }, token: string) {
  response.cookies.set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 90 * 86400 });
}

export function setSessionCookie(response: { cookies: { set: (name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number }) => unknown } }, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function publicUser(user: typeof users.$inferSelect, includePrivate = false) {
  return {
    id: user.id, name: user.name, handle: user.handle, headline: user.headline,
    bio: user.bio, avatar: user.avatar, reputation: user.reputation, plan: user.plan,
    locale: user.locale, isAdmin: user.isAdmin,
    ...(includePrivate ? { email: user.email, phone: user.phone, subscriptionStatus: user.subscriptionStatus } : {}),
  };
}

export async function notify(userId: string, actorId: string, message: string, postId?: number) {
  if (userId === actorId) return;
  await db.insert(notifications).values({ userId, actorId, message, postId });
}

export async function changeReputation(userId: string, delta: number, reason: string) {
  await db.update(users).set({ reputation: sql`${users.reputation} + ${delta}` }).where(eq(users.id, userId));
  await db.insert(reputationEvents).values({ userId, delta, reason });
}
