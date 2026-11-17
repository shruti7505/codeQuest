import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gt, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookmarks, closeVotes, comments, commentVotes, follows, notifications, posts, postVotes, reports, reputationEvents, sessions, transfers, users } from "@/db/schema";
import { changeReputation, createSession, DEMO_ID, ensureSeed, getCurrentUser, hashToken, notify, publicUser, SESSION_COOKIE, setSessionCookie } from "@/lib/server";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const actionPath = (request: NextRequest) => (request.nextUrl.searchParams.get("path") || "").split("/").filter(Boolean);
const dayStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); };
const intId = (value: string | undefined) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;

async function feed(request: NextRequest, user: typeof users.$inferSelect) {
  const search = request.nextUrl.searchParams;
  const filter = search.get("filter") || "latest";
  const query = (search.get("q") || "").trim().slice(0, 100);
  const tag = (search.get("tag") || "").toLowerCase().replace(/[^a-z0-9+#.-]/g, "").slice(0, 30);
  const page = Math.min(Math.max(Number.parseInt(search.get("page") || "0", 10) || 0, 0), 10000);
  const conditions: SQL[] = [eq(posts.removed, false)];
  if (filter === "questions") conditions.push(eq(posts.type, "question"));
  if (filter === "following") conditions.push(sql`exists (select 1 from ${follows} where ${follows.followingId} = ${posts.authorId} and ${follows.followerId} = ${user.id})`);
  if (filter === "bookmarks") conditions.push(sql`exists (select 1 from ${bookmarks} where ${bookmarks.postId} = ${posts.id} and ${bookmarks.userId} = ${user.id})`);
  if (filter === "mine") conditions.push(eq(posts.authorId, user.id));
  if (query) conditions.push(or(ilike(posts.title, `%${query}%`), ilike(posts.body, `%${query}%`), sql`${posts.tags}::text ilike ${`%${query}%`}`)!);
  if (tag) conditions.push(sql`${tag} = any(${posts.tags})`);
  const sharedId = intId(search.get("post") || undefined);
  if (sharedId) conditions.push(eq(posts.id, sharedId));
  const order = filter === "trending" ? sql`${posts.seedLikes} + coalesce((select sum(${postVotes.value}) from ${postVotes} where ${postVotes.postId} = ${posts.id}), 0) desc` : desc(posts.createdAt);
  const rows = await db.select().from(posts).where(and(...conditions)).orderBy(order, desc(posts.id)).limit(7).offset(page * 6);
  const hasMore = rows.length > 6;
  const selected = rows.slice(0, 6);
  if (!selected.length) return { posts: [], hasMore: false };
  const ids = selected.map((p) => p.id);
  const authorIds = [...new Set(selected.map((p) => p.authorId))];
  const [authors, allVotes, saved, commentCounts, following, closeVotesForPosts] = await Promise.all([
    db.select().from(users).where(inArray(users.id, authorIds)),
    db.select().from(postVotes).where(inArray(postVotes.postId, ids)),
    db.select().from(bookmarks).where(and(inArray(bookmarks.postId, ids), eq(bookmarks.userId, user.id))),
    db.select({ postId: comments.postId, total: sql<number>`count(*)::int` }).from(comments).where(inArray(comments.postId, ids)).groupBy(comments.postId),
    db.select().from(follows).where(and(eq(follows.followerId, user.id), inArray(follows.followingId, authorIds))),
    db.select().from(closeVotes).where(inArray(closeVotes.postId, ids)),
  ]);
  return { posts: selected.map((post) => {
    const reactions = allVotes.filter((v) => v.postId === post.id);
    return { ...post, author: publicUser(authors.find((a) => a.id === post.authorId)!), likes: post.seedLikes + reactions.reduce((sum, v) => sum + v.value, 0), vote: reactions.find((v) => v.userId === user.id)?.value || 0, bookmarked: saved.some((b) => b.postId === post.id), commentCount: post.seedComments + (commentCounts.find((c) => c.postId === post.id)?.total || 0), following: following.some((f) => f.followingId === post.authorId), closeVoteCount: closeVotesForPosts.filter((v) => v.postId === post.id).length, closeVoted: closeVotesForPosts.some((v) => v.postId === post.id && v.userId === user.id) };
  }), hasMore };
}

async function listMembers(userId: string) {
  const [members, followed] = await Promise.all([
    db.select().from(users).where(and(ne(users.id, userId), eq(users.isSuspended, false))).orderBy(desc(users.reputation)).limit(30),
    db.select().from(follows).where(eq(follows.followerId, userId)),
  ]);
  return members.map((member) => ({ ...publicUser(member), following: followed.some((f) => f.followingId === member.id) }));
}

async function listComments(postId: number, userId: string) {
  const rows = await db.select({ comment: comments, author: users }).from(comments).innerJoin(users, eq(comments.authorId, users.id)).where(eq(comments.postId, postId)).orderBy(asc(comments.createdAt));
  if (!rows.length) return [];
  const votes = await db.select().from(commentVotes).where(inArray(commentVotes.commentId, rows.map((r) => r.comment.id)));
  return rows.map(({ comment, author }) => ({ ...comment, author: publicUser(author), score: votes.filter((v) => v.commentId === comment.id).reduce((sum, v) => sum + v.value, 0), vote: votes.find((v) => v.commentId === comment.id && v.userId === userId)?.value || 0 }));
}

export async function GET(request: NextRequest) {
  try {
    await ensureSeed();
    const path = actionPath(request);
    const user = await getCurrentUser();
    if (path[0] === "session") {
      if (!user && process.env.ENABLE_DEMO_MODE !== "false") {
        const [demo] = await db.select().from(users).where(eq(users.id, DEMO_ID)).limit(1);
        if (demo) {
          const token = await createSession(demo.id, request);
          const response = NextResponse.json({ user: publicUser(demo, true), demo: true });
          setSessionCookie(response, token);
          return response;
        }
      }
      return NextResponse.json({ user: user ? publicUser(user, true) : null, demo: user?.id === DEMO_ID });
    }
    if (!user) return fail("Please sign in to continue.", 401);
    if (path[0] === "feed" || !path.length) return NextResponse.json(await feed(request, user));
    if (path[0] === "members") return NextResponse.json({ members: await listMembers(user.id) });
    if (path[0] === "tags") {
      const result = await db.execute(sql`select tag, count(*)::int as count from ${posts}, unnest(${posts.tags}) as tag where ${posts.removed} = false group by tag order by count desc, tag asc limit 30`);
      return NextResponse.json({ tags: result.rows });
    }
    if (path[0] === "notifications") {
      const items = await db.select({ item: notifications, actor: users }).from(notifications).leftJoin(users, eq(notifications.actorId, users.id)).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(40);
      return NextResponse.json({ notifications: items.map(({ item, actor }) => ({ ...item, actor: actor ? publicUser(actor) : null })) });
    }
    if (path[0] === "posts" && path[2] === "comments") return NextResponse.json({ comments: await listComments(intId(path[1]), user.id) });
    if (path[0] === "activity") {
      const events = await db.select().from(reputationEvents).where(eq(reputationEvents.userId, user.id)).orderBy(desc(reputationEvents.createdAt)).limit(50);
      const history = await db.select().from(transfers).where(or(eq(transfers.senderId, user.id), eq(transfers.receiverId, user.id))).orderBy(desc(transfers.createdAt)).limit(50);
      return NextResponse.json({ events, transfers: history });
    }
    if (path[0] === "sessions") {
      const items = await db.select({ id: sessions.tokenHash, userAgent: sessions.userAgent, browser: sessions.browser, os: sessions.os, device: sessions.device, location: sessions.location, ip: sessions.ip, createdAt: sessions.createdAt, lastActiveAt: sessions.lastActiveAt }).from(sessions).where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))).orderBy(desc(sessions.createdAt));
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      return NextResponse.json({ sessions: items.map((item) => ({ ...item, current: !!token && hashToken(token) === item.id })) });
    }
    if (path[0] === "login-activity") {
      if (!user.isAdmin) return fail("Administrator access required.", 403);
      const items = await db.select({ name: users.name, handle: users.handle, browser: sessions.browser, os: sessions.os, device: sessions.device, ip: sessions.ip, location: sessions.location, createdAt: sessions.createdAt }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).orderBy(desc(sessions.createdAt)).limit(100);
      return NextResponse.json({ activity: items });
    }
    if (path[0] === "reports") {
      if (!user.isAdmin) return fail("Administrator access required.", 403);
      const items = await db.select({ report: reports, post: posts, reporter: users }).from(reports).innerJoin(posts, eq(reports.postId, posts.id)).innerJoin(users, eq(reports.reporterId, users.id)).orderBy(desc(reports.createdAt)).limit(100);
      return NextResponse.json({ reports: items.map(({ report, post, reporter }) => ({ ...report, postTitle: post.title, reporter: publicUser(reporter) })) });
    }
    return fail("Not found.", 404);
  } catch (error) { console.error("Community GET", error); return fail("Something went wrong. Please try again.", 500); }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSeed();
    const path = actionPath(request);
    const user = await getCurrentUser();
    if (!user) return fail("Please sign in to continue.", 401);
    const body = await request.json().catch(() => ({}));
    if (path[0] === "posts" && !path[1]) {
      const parsed = z.object({ type: z.enum(["question", "update", "project"]), title: z.string().trim().min(3).max(180), body: z.string().trim().min(3).max(10000), code: z.string().max(4000).optional(), imageUrl: z.string().max(2000).regex(/^https?:\/\//).or(z.literal("")).optional(), tags: z.array(z.string().regex(/^[a-z0-9+#.-]{1,30}$/)).max(5).optional() }).safeParse(body);
      if (!parsed.success) return fail("Please add a title, some details, and up to five valid tags.");
      if (parsed.data.type === "question") {
        const limits: Record<string, number> = { free: 1, bronze: 5, silver: 15, gold: Infinity };
        const limit = limits[user.plan] || 1;
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.authorId, user.id), eq(posts.type, "question"), gte(posts.createdAt, dayStart())));
        if (count >= limit) return fail(`Your ${user.plan} plan allows ${limit} question${limit === 1 ? "" : "s"} per day. Explore plans to post more.`, 429);
      }
      const [post] = await db.insert(posts).values({ authorId: user.id, ...parsed.data, tags: parsed.data.tags || [], code: parsed.data.code || "" }).returning();
      return NextResponse.json({ post }, { status: 201 });
    }
    const postId = intId(path[1]);
    if (path[0] === "posts" && postId) {
      const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.removed, false))).limit(1);
      if (!post) return fail("Post not found.", 404);
      if (path[2] === "vote") {
        const value = body.value === -1 ? -1 : 1;
        if (post.authorId === user.id) return fail("You can't vote on your own post.");
        const [existing] = await db.select().from(postVotes).where(and(eq(postVotes.postId, postId), eq(postVotes.userId, user.id)));
        const next = existing?.value === value ? 0 : value;
        const [{ score }] = await db.select({ score: sql<number>`coalesce(sum(${postVotes.value}), 0)::int` }).from(postVotes).where(eq(postVotes.postId, postId));
        if (!next) await db.delete(postVotes).where(and(eq(postVotes.postId, postId), eq(postVotes.userId, user.id)));
        else await db.insert(postVotes).values({ postId, userId: user.id, value: next }).onConflictDoUpdate({ target: [postVotes.postId, postVotes.userId], set: { value: next } });
        if (existing?.value === -1 && next !== -1) await changeReputation(post.authorId, 2, "Downvote removed from a post");
        if (existing?.value !== -1 && next === -1) await changeReputation(post.authorId, -2, "A post received a downvote");
        const before = post.seedLikes + score, after = before - (existing?.value || 0) + next;
        if (post.type === "question" && before < 10 && after >= 10) await changeReputation(post.authorId, 2, "Question reached 10 upvotes");
        if (post.type === "question" && before >= 10 && after < 10) await changeReputation(post.authorId, -2, "Question fell below 10 upvotes");
        if (next === 1 && existing?.value !== 1) await notify(post.authorId, user.id, "liked your post.", postId);
        return NextResponse.json({ vote: next, likes: after });
      }
      if (path[2] === "bookmark") {
        const [existing] = await db.select().from(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, user.id)));
        if (existing) await db.delete(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, user.id)));
        else await db.insert(bookmarks).values({ postId, userId: user.id }).onConflictDoNothing();
        return NextResponse.json({ bookmarked: !existing });
      }
      if (path[2] === "close-vote") {
        if (post.type !== "question") return fail("Only questions can be closed.");
        if (user.reputation < 250) return fail("Voting to close unlocks at 250 reputation points.", 403);
        const [existing] = await db.select().from(closeVotes).where(and(eq(closeVotes.postId, postId), eq(closeVotes.userId, user.id)));
        if (existing) await db.delete(closeVotes).where(and(eq(closeVotes.postId, postId), eq(closeVotes.userId, user.id)));
        else await db.insert(closeVotes).values({ postId, userId: user.id }).onConflictDoNothing();
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(closeVotes).where(eq(closeVotes.postId, postId));
        const closed = count >= 5;
        await db.update(posts).set({ closed }).where(eq(posts.id, postId));
        return NextResponse.json({ closeVoted: !existing, closeVoteCount: count, closed });
      }
      if (path[2] === "comments") {
        const parsed = z.object({ body: z.string().trim().min(1).max(4000), parentId: z.number().int().positive().nullable().optional() }).safeParse(body);
        if (!parsed.success) return fail("Please write a reply first.");
        if (post.closed && post.type === "question" && !parsed.data.parentId) return fail("This question is closed to new answers.");
        if (user.reputation < 50) {
          const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(comments).where(and(eq(comments.authorId, user.id), gte(comments.createdAt, dayStart())));
          if (count >= 3) return fail("New members can post 3 replies per day. Unlimited replies unlock at 50 reputation.", 429);
        }
        if (parsed.data.parentId) {
          const [parent] = await db.select().from(comments).where(and(eq(comments.id, parsed.data.parentId), eq(comments.postId, postId)));
          if (!parent) return fail("Reply not found.", 404);
          await notify(parent.authorId, user.id, "replied to your comment.", postId);
        }
        const [comment] = await db.insert(comments).values({ postId, authorId: user.id, body: parsed.data.body, parentId: parsed.data.parentId || null }).returning();
        if (post.type === "question" && !parsed.data.parentId) await changeReputation(user.id, 5, "Posted an answer");
        await notify(post.authorId, user.id, post.type === "question" ? "answered your question." : "commented on your post.", postId);
        const mentions = [...parsed.data.body.matchAll(/@([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase());
        if (mentions.length) {
          const mentioned = await db.select().from(users).where(inArray(users.handle, mentions));
          for (const member of mentioned) await notify(member.id, user.id, "mentioned you in a reply.", postId);
        }
        return NextResponse.json({ comment }, { status: 201 });
      }
      if (path[2] === "report") {
        if (user.reputation < 500) return fail("Reporting unlocks at 500 reputation points.", 403);
        const reason = z.string().trim().min(5).max(500).safeParse(body.reason);
        if (!reason.success) return fail("Please explain why you're reporting this post.");
        await db.insert(reports).values({ postId, reporterId: user.id, reason: reason.data }).onConflictDoNothing();
        return NextResponse.json({ ok: true });
      }
      if (path[2] === "accept") {
        if (post.authorId !== user.id || post.type !== "question") return fail("Only the question author can accept an answer.", 403);
        const commentId = Number(body.commentId);
        const [answer] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.postId, postId)));
        if (!answer || answer.parentId) return fail("Answer not found.", 404);
        if (post.acceptedCommentId) {
          const [previous] = await db.select().from(comments).where(eq(comments.id, post.acceptedCommentId));
          if (previous) await changeReputation(previous.authorId, -10, "Accepted answer was changed");
        }
        const next = post.acceptedCommentId === commentId ? null : commentId;
        await db.update(posts).set({ acceptedCommentId: next }).where(eq(posts.id, postId));
        if (next) { await changeReputation(answer.authorId, 10, "Answer accepted"); await notify(answer.authorId, user.id, "accepted your answer.", postId); }
        return NextResponse.json({ acceptedCommentId: next });
      }
    }
    if (path[0] === "comments" && intId(path[1]) && path[2] === "vote") {
      const commentId = intId(path[1]);
      const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
      if (!comment) return fail("Reply not found.", 404);
      if (comment.authorId === user.id) return fail("You can't vote on your own reply.");
      const value = body.value === -1 ? -1 : 1;
      const [existing] = await db.select().from(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, user.id)));
      const [{ score }] = await db.select({ score: sql<number>`coalesce(sum(${commentVotes.value}), 0)::int` }).from(commentVotes).where(eq(commentVotes.commentId, commentId));
      const next = existing?.value === value ? 0 : value;
      if (!next) await db.delete(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, user.id)));
      else await db.insert(commentVotes).values({ commentId, userId: user.id, value: next }).onConflictDoUpdate({ target: [commentVotes.commentId, commentVotes.userId], set: { value: next } });
      if (existing?.value === -1 && next !== -1) await changeReputation(comment.authorId, 2, "Downvote removed from an answer");
      if (existing?.value !== -1 && next === -1) await changeReputation(comment.authorId, -2, "An answer received a downvote");
      const after = score - (existing?.value || 0) + next;
      if (score < 5 && after >= 5) await changeReputation(comment.authorId, 5, "Answer reached 5 upvotes");
      if (score >= 5 && after < 5) await changeReputation(comment.authorId, -5, "Answer fell below 5 upvotes");
      return NextResponse.json({ score: after, vote: next });
    }
    if (path[0] === "members" && path[1] && path[2] === "follow") {
      const targetId = path[1];
      if (targetId === user.id) return fail("You can't follow yourself.");
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return fail("Member not found.", 404);
      const [existing] = await db.select().from(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, targetId)));
      if (existing) await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, targetId)));
      else { await db.insert(follows).values({ followerId: user.id, followingId: targetId }).onConflictDoNothing(); await notify(targetId, user.id, "started following you."); }
      return NextResponse.json({ following: !existing });
    }
    if (path[0] === "transfer") {
      const parsed = z.object({ receiverId: z.string().min(1), amount: z.number().int().min(1).max(50), reason: z.string().trim().min(3).max(200) }).safeParse(body);
      if (!parsed.success) return fail("Enter a recipient, a reason, and 1–50 points.");
      const { receiverId, amount, reason } = parsed.data;
      if (receiverId === user.id) return fail("Choose another member.");
      const result = await db.transaction(async (tx) => {
        const [sender] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
        const [receiver] = await tx.select().from(users).where(eq(users.id, receiverId));
        const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${transfers.amount}), 0)::int` }).from(transfers).where(and(eq(transfers.senderId, user.id), gte(transfers.createdAt, dayStart())));
        if (!receiver) return "Member not found.";
        if (sender.reputation <= 50 || sender.reputation < amount) return "You need more than 50 reputation points and enough points to transfer.";
        if (total + amount > 100) return "You can transfer at most 100 points per day.";
        await tx.update(users).set({ reputation: sql`${users.reputation} - ${amount}` }).where(eq(users.id, user.id));
        await tx.update(users).set({ reputation: sql`${users.reputation} + ${amount}` }).where(eq(users.id, receiverId));
        await tx.insert(transfers).values({ senderId: user.id, receiverId, amount, reason });
        await tx.insert(reputationEvents).values([{ userId: user.id, delta: -amount, reason: `Transfer to @${receiver.handle}: ${reason}` }, { userId: receiverId, delta: amount, reason: `Transfer from @${sender.handle}: ${reason}` }]);
        return null;
      });
      if (result) return fail(result);
      await notify(receiverId, user.id, `sent you ${amount} reputation points.`);
      return NextResponse.json({ ok: true });
    }
    return fail("Not found.", 404);
  } catch (error) { console.error("Community POST", error); return fail("Something went wrong. Please try again.", 500); }
}

export async function PATCH(request: NextRequest) {
  try {
    const path = actionPath(request);
    const user = await getCurrentUser();
    if (!user) return fail("Please sign in to continue.", 401);
    const body = await request.json().catch(() => ({}));
    if (path[0] === "notifications") {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "profile") {
      const parsed = z.object({ name: z.string().trim().min(2).max(60), headline: z.string().trim().min(2).max(100), bio: z.string().trim().max(500), phone: z.string().regex(/^\+[1-9]\d{7,14}$/).or(z.literal("")).optional() }).safeParse(body);
      if (!parsed.success) return fail("Please enter a name and headline. Phone numbers must use international format, e.g. +14155552671.");
      const [updated] = await db.update(users).set({ name: parsed.data.name, headline: parsed.data.headline, bio: parsed.data.bio, phone: parsed.data.phone || null }).where(eq(users.id, user.id)).returning();
      if (!user.profileBonusAwarded && updated.name && updated.headline && updated.bio && updated.email && updated.phone) {
        await db.update(users).set({ profileBonusAwarded: true }).where(eq(users.id, user.id)); await changeReputation(user.id, 10, "Completed your profile"); updated.reputation += 10;
      }
      return NextResponse.json({ user: publicUser(updated, true) });
    }
    if (path[0] === "posts" && intId(path[1])) {
      const id = intId(path[1]);
      const [post] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.removed, false)));
      if (!post) return fail("Post not found.", 404);
      if (post.authorId !== user.id && user.reputation < 100 && !user.isAdmin) return fail("Editing community posts unlocks at 100 reputation.", 403);
      const parsed = z.object({ title: z.string().trim().min(3).max(180), body: z.string().trim().min(3).max(10000), code: z.string().max(4000).optional(), imageUrl: z.string().max(2000).regex(/^https?:\/\//).or(z.literal("")).optional(), tags: z.array(z.string().regex(/^[a-z0-9+#.-]{1,30}$/)).max(5).optional() }).safeParse(body);
      if (!parsed.success) return fail("Please check your title, details, and tags.");
      await db.update(posts).set({ ...parsed.data, updatedAt: new Date() }).where(eq(posts.id, id));
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "reports" && intId(path[1])) {
      if (!user.isAdmin) return fail("Administrator access required.", 403);
      const [report] = await db.select().from(reports).where(eq(reports.id, intId(path[1])));
      if (!report) return fail("Report not found.", 404);
      if (report.status !== "pending") return fail("This report has already been reviewed.");
      const action = z.enum(["dismiss", "remove", "suspend"]).safeParse(body.action);
      if (!action.success) return fail("Choose a moderation action.");
      await db.update(reports).set({ status: action.data === "dismiss" ? "dismissed" : "resolved" }).where(eq(reports.id, report.id));
      if (action.data !== "dismiss") {
        const [post] = await db.select().from(posts).where(eq(posts.id, report.postId));
        if (post && !post.removed) { await db.update(posts).set({ removed: true }).where(eq(posts.id, post.id)); await changeReputation(post.authorId, -10, "Content removed by a moderator"); }
        if (post && action.data === "suspend") await db.update(users).set({ isSuspended: true }).where(eq(users.id, post.authorId));
      }
      return NextResponse.json({ ok: true });
    }
    return fail("Not found.", 404);
  } catch (error) { console.error("Community PATCH", error); return fail("Could not save your changes. Check that your phone number isn't already in use.", 500); }
}

export async function DELETE(request: NextRequest) {
  try {
    const path = actionPath(request);
    const user = await getCurrentUser();
    if (!user) return fail("Please sign in to continue.", 401);
    if (path[0] === "posts" && intId(path[1])) {
      const [post] = await db.select().from(posts).where(eq(posts.id, intId(path[1])));
      if (!post) return fail("Post not found.", 404);
      if (post.authorId !== user.id && !user.isAdmin) return fail("You can only delete your own posts.", 403);
      await db.update(posts).set({ removed: true }).where(eq(posts.id, post.id));
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "comments" && intId(path[1])) {
      const [comment] = await db.select().from(comments).where(eq(comments.id, intId(path[1])));
      if (!comment) return fail("Reply not found.", 404);
      if (comment.authorId !== user.id) return fail("You can only delete your own replies.", 403);
      const [post] = await db.select().from(posts).where(eq(posts.id, comment.postId));
      if (post.type === "question" && !comment.parentId) await changeReputation(user.id, -5, "Deleted an answer");
      if (post.acceptedCommentId === comment.id) { await db.update(posts).set({ acceptedCommentId: null }).where(eq(posts.id, post.id)); await changeReputation(user.id, -10, "Accepted answer deleted"); }
      await db.delete(comments).where(eq(comments.id, comment.id));
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "sessions" && path[1]) {
      await db.delete(sessions).where(and(eq(sessions.tokenHash, path[1]), eq(sessions.userId, user.id)));
      return NextResponse.json({ ok: true });
    }
    return fail("Not found.", 404);
  } catch (error) { console.error("Community DELETE", error); return fail("Something went wrong. Please try again.", 500); }
}
