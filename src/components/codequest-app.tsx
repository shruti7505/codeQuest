"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Award, Bell,
  Bookmark, BookmarkCheck, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Code2, Crown, ExternalLink, FileCode2, Flag, Globe2, Hash, Heart, ImagePlus,
  LayoutGrid, Lightbulb, Link2, LoaderCircle, LogIn, LogOut, Menu, MessageCircle,
  MessageSquare, MoreHorizontal, Pencil, Plus, Search, Send, Settings, Share2,
  ShieldCheck, SlidersHorizontal, Sparkles, Tags, Trash2, TrendingUp, Trophy, Users, X, Zap,
} from "lucide-react";
import type { Activity as ReputationActivity, AppNotification, Comment, Member, Post } from "@/lib/types";
import { translate } from "@/lib/i18n";

type Section = "feed" | "questions" | "tags" | "members" | "bookmarks" | "activity" | "notifications" | "profile" | "plans" | "settings" | "moderation";
type TagItem = { tag: string; count: number };
type SessionItem = { id: string; userAgent: string; browser: string; os: string; device: string; location: string; ip: string; createdAt: string; current: boolean };
type LoginActivity = { name: string; handle: string; browser: string; os: string; device: string; ip: string; location: string; createdAt: string };
type Invoice = { id: string; number: string | null; amount: number; currency: string; status: string; created: number; pdf: string | null; url: string | null };
type Report = { id: number; postTitle: string; reason: string; status: string; reporter: Member };
type Modal = "compose" | "auth" | "report" | "transfer" | "guidelines" | null;

const EMPTY_USER: Member = { id: "", name: "Alex Morgan", handle: "alexmorgan", headline: "Frontend Developer", bio: "", avatar: 0, reputation: 1280, plan: "free", locale: "en", isAdmin: false };
const formatNumber = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(value);
const timeAgo = (value: string) => {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

async function jsonRequest(url: string, method = "GET", data?: unknown) {
  const response = await fetch(url, { method, ...(data !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}
function community(path: string, method = "GET", data?: unknown, params?: Record<string, string>) {
  const query = new URLSearchParams({ path, ...params });
  return jsonRequest(`/api/community?${query}`, method, data);
}
function Avatar({ index = 0, size = 40, className = "" }: { index?: number; size?: number; className?: string }) {
  const i = Math.abs(index % 9);
  return <span aria-hidden="true" className={`avatar ${className}`} style={{ width: size, height: size, minWidth: size, backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%` }} />;
}
function Logo() {
  return <div className="brand" aria-label="CodeQuest"><span className="brand-mark"><Code2 size={22} strokeWidth={2.8} /></span><span>Code<span className="brand-accent">Quest</span><span className="brand-dot">.</span></span></div>;
}
function Dialog({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></div>{children}</div></div>;
}

export default function CodeQuestApp() {
  const [user, setUser] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [section, setSection] = useState<Section>("feed");
  const [tab, setTab] = useState<"foryou" | "following" | "trending">("foryou");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [sharedPost, setSharedPost] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tagItems, setTagItems] = useState<TagItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activity, setActivity] = useState<ReputationActivity[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loginActivity, setLoginActivity] = useState<LoginActivity[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [postMenu, setPostMenu] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [compose, setCompose] = useState({ type: "question", title: "", body: "", tags: "", code: "", imageUrl: "" });
  const [editing, setEditing] = useState<Post | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [reportPost, setReportPost] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authChallenge, setAuthChallenge] = useState<number | null>(null);
  const [loginCode, setLoginCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [auth, setAuth] = useState({ name: "", handle: "", email: "", identifier: "", password: "" });
  const [profile, setProfile] = useState({ name: "", headline: "", bio: "", phone: "" });
  const [language, setLanguage] = useState("en");
  const [languageSent, setLanguageSent] = useState(false);
  const [languageCode, setLanguageCode] = useState("");
  const [transfer, setTransfer] = useState({ receiverId: "", amount: "10", reason: "" });
  const sentinel = useRef<HTMLDivElement>(null);
  const current = user || EMPTY_USER;
  const tr = (phrase: string) => translate(current.locale, phrase);
  const unread = notifications.filter((item) => !item.read).length;
  const isFeed = ["feed", "questions", "bookmarks", "profile"].includes(section);

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };
  const refreshExtras = useCallback(async () => {
    try {
      const [memberResult, tagResult, notificationResult] = await Promise.all([community("members"), community("tags"), community("notifications")]);
      setMembers(memberResult.members); setTagItems(tagResult.tags); setNotifications(notificationResult.notifications);
    } catch (error) { console.error(error); }
  }, []);
  const refreshUser = useCallback(async () => {
    const result = await community("session");
    setUser(result.user); setDemo(!!result.demo);
    return result.user as Member | null;
  }, []);

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("post");
    if (shared) setSharedPost(shared);
    refreshUser().then((me) => { if (me) refreshExtras(); else { setAuthMode("login"); setModal("auth"); } }).catch(() => flash("Could not connect to the community. Please refresh." )).finally(() => setReady(true));
  }, [refreshUser, refreshExtras]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { if (user) document.documentElement.lang = user.locale || "en"; }, [user]);
  useEffect(() => { if (user) { setProfile({ name: user.name, headline: user.headline, bio: user.bio, phone: user.phone || "" }); setLanguage(user.locale || "en"); } }, [user]);
  useEffect(() => {
    if (!user) return;
    if (section === "activity") community("activity").then((data) => setActivity(data.events)).catch((e) => flash(e.message));
    if (section === "settings") {
      community("sessions").then((data) => setSessions(data.sessions)).catch((e) => flash(e.message));
      jsonRequest("/api/billing").then((data) => setInvoices(data.invoices || [])).catch(() => {});
    }
    if (section === "moderation" && user.isAdmin) {
      community("reports").then((data) => setReports(data.reports)).catch((e) => flash(e.message));
      community("login-activity").then((data) => setLoginActivity(data.activity)).catch((e) => flash(e.message));
    }
  }, [section, user, revision]);

  const loadFeed = useCallback(async (nextPage = 0, append = false) => {
    if (!user || !isFeed) return;
    setLoading(true);
    const filter = section === "questions" ? "questions" : section === "bookmarks" ? "bookmarks" : section === "profile" ? "mine" : tab === "foryou" ? "latest" : tab;
    try {
      const data = await community("feed", "GET", undefined, { filter, q: query, tag, page: String(nextPage), post: sharedPost });
      setPosts((old) => append ? [...old, ...data.posts] : data.posts);
      setPage(nextPage); setHasMore(data.hasMore);
    } catch (error) { flash(error instanceof Error ? error.message : "Could not load your feed."); }
    finally { setLoading(false); }
  }, [user, isFeed, section, tab, query, tag, sharedPost]);
  useEffect(() => { if (user && isFeed) { setPosts([]); setPage(0); loadFeed(0); } }, [loadFeed, revision, user, isFeed]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || loading || !isFeed) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadFeed(page + 1, true); }, { rootMargin: "200px" });
    observer.observe(element); return () => observer.disconnect();
  }, [hasMore, loading, page, loadFeed, isFeed]);

  function navigate(next: Section) {
    setSection(next); setTag(""); setSharedPost(""); setSearch(""); setQuery(""); setNavOpen(false); setShowProfileMenu(false); setShowNotifications(false);
    if (typeof window !== "undefined" && window.location.search.includes("post=")) window.history.replaceState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openCompose(type = "question", post?: Post) {
    if (!user) { setModal("auth"); return; }
    setEditing(post || null); setFormError(""); setShowCode(!!post?.code); setShowImage(!!post?.imageUrl);
    setCompose(post ? { type: post.type, title: post.title, body: post.body, tags: post.tags.join(", "), code: post.code, imageUrl: post.imageUrl } : { type, title: "", body: "", tags: "", code: "", imageUrl: "" });
    setModal("compose");
  }
  async function submitPost(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setFormError("");
    try {
      const payload = { ...compose, tags: compose.tags.split(/[,\s]+/).map((value) => value.replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 5) };
      await community(editing ? `posts/${editing.id}` : "posts", editing ? "PATCH" : "POST", payload);
      setModal(null); setSection("feed"); setTag(""); setSharedPost(""); setTab("foryou"); setRevision((v) => v + 1); refreshExtras();
      flash(editing ? "Your changes have been saved." : "Your post is live. Thanks for sharing!");
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not publish post."); }
    finally { setSubmitting(false); }
  }
  async function vote(post: Post, value = 1) {
    try { const data = await community(`posts/${post.id}/vote`, "POST", { value }); setPosts((old) => old.map((p) => p.id === post.id ? { ...p, vote: data.vote, likes: data.likes } : p)); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not vote."); }
  }
  async function bookmark(post: Post) {
    try {
      const data = await community(`posts/${post.id}/bookmark`, "POST", {});
      setPosts((old) => section === "bookmarks" && !data.bookmarked ? old.filter((p) => p.id !== post.id) : old.map((p) => p.id === post.id ? { ...p, bookmarked: data.bookmarked } : p));
      flash(data.bookmarked ? "Saved to your bookmarks." : "Removed from bookmarks.");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not save post."); }
  }
  async function follow(memberId: string) {
    try {
      const data = await community(`members/${memberId}/follow`, "POST", {});
      setMembers((old) => old.map((m) => m.id === memberId ? { ...m, following: data.following } : m));
      setPosts((old) => old.map((p) => p.author.id === memberId ? { ...p, following: data.following } : p));
      flash(data.following ? "You're now following this member." : "Member unfollowed.");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not follow member."); }
  }
  async function openComments(post: Post) {
    if (expanded === post.id) { setExpanded(null); setReplyTo(null); return; }
    setExpanded(post.id); setCommentText(""); setReplyTo(null);
    try { const data = await community(`posts/${post.id}/comments`); setCommentsByPost((old) => ({ ...old, [post.id]: data.comments })); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not load replies."); }
  }
  async function sendComment(event: FormEvent, post: Post) {
    event.preventDefault(); if (!commentText.trim()) return; setSubmitting(true);
    try {
      await community(`posts/${post.id}/comments`, "POST", { body: commentText, parentId: replyTo?.id || null });
      const data = await community(`posts/${post.id}/comments`);
      setCommentsByPost((old) => ({ ...old, [post.id]: data.comments }));
      setPosts((old) => old.map((p) => p.id === post.id ? { ...p, commentCount: p.commentCount + 1 } : p));
      setCommentText(""); setReplyTo(null); refreshUser(); flash(post.type === "question" && !replyTo ? "Answer posted! You earned 5 reputation." : "Reply posted.");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not post reply."); }
    finally { setSubmitting(false); }
  }
  async function voteComment(postId: number, comment: Comment, value: number) {
    try {
      const data = await community(`comments/${comment.id}/vote`, "POST", { value });
      setCommentsByPost((old) => ({ ...old, [postId]: (old[postId] || []).map((c) => c.id === comment.id ? { ...c, score: data.score, vote: data.vote } : c) }));
    } catch (error) { flash(error instanceof Error ? error.message : "Could not vote."); }
  }
  async function acceptComment(post: Post, comment: Comment) {
    try { const data = await community(`posts/${post.id}/accept`, "POST", { commentId: comment.id }); setPosts((old) => old.map((p) => p.id === post.id ? { ...p, acceptedCommentId: data.acceptedCommentId } : p)); flash(data.acceptedCommentId ? "Answer accepted." : "Acceptance removed."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not accept answer."); }
  }
  async function deleteComment(post: Post, comment: Comment) {
    if (!window.confirm("Delete this reply?")) return;
    try { await community(`comments/${comment.id}`, "DELETE"); setCommentsByPost((old) => ({ ...old, [post.id]: (old[post.id] || []).filter((c) => c.id !== comment.id) })); setPosts((old) => old.map((p) => p.id === post.id ? { ...p, commentCount: p.commentCount - 1 } : p)); refreshUser(); flash("Reply deleted."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not delete reply."); }
  }
  async function share(post: Post) {
    const url = `${window.location.origin}/?post=${post.id}`;
    try { await navigator.clipboard.writeText(url); flash("Link copied to your clipboard."); }
    catch { window.prompt("Copy this link:", url); }
  }
  async function deletePost(post: Post) {
    setPostMenu(null); if (!window.confirm("Delete this post? This can't be undone.")) return;
    try { await community(`posts/${post.id}`, "DELETE"); setPosts((old) => old.filter((p) => p.id !== post.id)); refreshExtras(); flash("Post deleted."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not delete post."); }
  }
  async function voteToClose(post: Post) {
    setPostMenu(null);
    try {
      const result = await community(`posts/${post.id}/close-vote`, "POST", {});
      setPosts((old) => old.map((p) => p.id === post.id ? { ...p, closeVoted: result.closeVoted, closeVoteCount: result.closeVoteCount, closed: result.closed } : p));
      flash(result.closed ? "This question is closed to new answers." : `${result.closeVoteCount} of 5 close votes recorded.`);
    } catch (error) { flash(error instanceof Error ? error.message : "Could not vote to close."); }
  }
  async function submitReport(event: FormEvent) {
    event.preventDefault(); if (!reportPost) return; setSubmitting(true); setFormError("");
    try { await community(`posts/${reportPost.id}/report`, "POST", { reason: reportReason }); setModal(null); setReportReason(""); flash("Report sent to the moderation team."); }
    catch (error) { setFormError(error instanceof Error ? error.message : "Could not send report."); }
    finally { setSubmitting(false); }
  }
  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setFormError("");
    try {
      const data = authChallenge
        ? await jsonRequest("/api/auth?action=login-verify", "POST", { challengeId: authChallenge, code: loginCode })
        : await jsonRequest(`/api/auth?action=${authMode}`, "POST", { ...auth, rememberDevice });
      if (data.requiresOtp) { setAuthChallenge(data.challengeId); setLoginCode(""); flash(data.message); return; }
      setUser(data.user); setDemo(false); setModal(null); setAuthChallenge(null); setLoginCode(""); setAuth({ name: "", handle: "", email: "", identifier: "", password: "" }); setRevision((v) => v + 1); refreshExtras(); flash(`Welcome ${authMode === "login" ? "back" : "to CodeQuest"}!`);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setSubmitting(false); }
  }
  async function logout() {
    await jsonRequest("/api/auth?action=logout", "POST", {}); setUser(null); setShowProfileMenu(false); setAuthMode("login"); setModal("auth"); flash("You've signed out.");
  }
  async function markRead() {
    try { await community("notifications", "PATCH", {}); setNotifications((old) => old.map((n) => ({ ...n, read: true }))); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not update notifications."); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setSubmitting(true);
    try { const data = await community("profile", "PATCH", profile); setUser(data.user); flash("Profile updated."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not save profile."); }
    finally { setSubmitting(false); }
  }
  async function requestLanguage() {
    setSubmitting(true);
    try { const result = await jsonRequest("/api/auth?action=language-request", "POST", { locale: language }); setLanguageSent(true); flash(result.message); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not send verification code."); }
    finally { setSubmitting(false); }
  }
  async function verifyLanguage() {
    setSubmitting(true);
    try { const result = await jsonRequest("/api/auth?action=language-verify", "POST", { code: languageCode }); setUser(result.user); setLanguageSent(false); setLanguageCode(""); flash("Language preference saved."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not verify code."); }
    finally { setSubmitting(false); }
  }
  async function startBilling(plan?: string) {
    setSubmitting(true);
    try { const data = await jsonRequest("/api/billing", "POST", plan ? { plan } : { action: "portal" }); if (data.url) window.location.href = data.url; }
    catch (error) { flash(error instanceof Error ? error.message : "Could not open billing."); }
    finally { setSubmitting(false); }
  }
  async function submitTransfer(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setFormError("");
    try { await community("transfer", "POST", { ...transfer, amount: Number(transfer.amount) }); setModal(null); setTransfer({ receiverId: "", amount: "10", reason: "" }); refreshUser(); setRevision((v) => v + 1); flash("Reputation transferred successfully."); }
    catch (error) { setFormError(error instanceof Error ? error.message : "Could not transfer points."); }
    finally { setSubmitting(false); }
  }
  async function revokeSession(item: SessionItem) {
    if (!window.confirm(item.current ? "Revoke your current session?" : "Revoke this device session?")) return;
    try { await community(`sessions/${item.id}`, "DELETE"); setSessions((old) => old.filter((s) => s.id !== item.id)); if (item.current) { setUser(null); setModal("auth"); } flash("Session revoked."); }
    catch (error) { flash(error instanceof Error ? error.message : "Could not revoke session."); }
  }
  function pickTag(value: string) { navigate("feed"); setTag(value); setTab("foryou"); }

  const navItems: { section: Section; label: string; icon: typeof LayoutGrid; count?: number }[] = [
    { section: "feed", label: tr("Community feed"), icon: LayoutGrid }, { section: "questions", label: tr("Questions"), icon: CircleHelp },
    { section: "tags", label: tr("Explore tags"), icon: Hash }, { section: "members", label: tr("Members"), icon: Users },
  ];
  const personalItems: { section: Section; label: string; icon: typeof LayoutGrid; count?: number }[] = [
    { section: "bookmarks", label: tr("Saved posts"), icon: Bookmark }, { section: "activity", label: tr("Your activity"), icon: Activity },
    { section: "notifications", label: tr("Notifications"), icon: Bell, count: unread },
  ];
  const NavItem = ({ item }: { item: typeof navItems[number] }) => <button className={`nav-item ${section === item.section ? "active" : ""}`} onClick={() => navigate(item.section)}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{!!item.count && <span className="nav-count">{item.count}</span>}</button>;

  const renderPost = (post: Post) => <article className="post-card card" key={post.id}>
    <div className="post-top">
      <Avatar index={post.author.avatar} size={43} />
      <div className="post-person"><div className="name-line"><strong>{post.author.name}</strong>{post.author.reputation >= 4000 && <CheckCircle2 className="verified" size={14} fill="currentColor" />}<span className="post-dot">·</span><span className="post-time">{timeAgo(post.createdAt)}</span></div><div className="person-meta">{post.author.headline} <span>·</span> <span>{post.type === "question" ? "asked a question" : post.type === "project" ? "shared a project" : "shared an update"}</span></div></div>
      <div className={`post-kind ${post.type}`}><span />{post.closed ? "Closed" : post.type === "question" ? "Question" : post.type === "project" ? "Showcase" : "Discussion"}</div>
      <div className="post-menu-wrap"><button className="icon-button post-more" aria-label="Post options" onClick={() => setPostMenu(postMenu === post.id ? null : post.id)}><MoreHorizontal size={21} /></button>
        {postMenu === post.id && <div className="small-menu post-dropdown">
          {(post.author.id === current.id || current.reputation >= 100 || current.isAdmin) && <button onClick={() => { setPostMenu(null); openCompose(post.type, post); }}><Pencil size={15} /> Edit post</button>}
          {(post.author.id === current.id || current.isAdmin) && <button onClick={() => deletePost(post)}><Trash2 size={15} /> Delete post</button>}
          {post.type === "question" && current.reputation >= 250 && <button onClick={() => voteToClose(post)}><ShieldCheck size={15} /> {post.closeVoted ? "Remove close vote" : "Vote to close"} ({post.closeVoteCount}/5)</button>}
          {post.author.id !== current.id && <button onClick={() => { setPostMenu(null); setReportPost(post); setReportReason(""); setFormError(""); setModal("report"); }}><Flag size={15} /> Report post</button>}
          <button onClick={() => { setPostMenu(null); share(post); }}><Link2 size={15} /> Copy link</button>
        </div>}
      </div>
    </div>
    <div className="post-content"><button className="post-title" onClick={() => openComments(post)}>{post.title}</button><p>{post.body}</p>
      {post.code && <pre className="code-block"><code>{post.code}</code></pre>}
      {post.imageUrl && <div className="post-image-wrap"><img src={post.imageUrl} alt="Image shared with post" className="post-image" /></div>}
      {post.type === "project" && post.author.id === "member-marcus" && <div className="project-preview"><div className="project-logo"><Zap size={21} fill="currentColor" /></div><div className="project-copy"><strong>FocusFlow <span>↗</span></strong><small>A little space for your big ideas.</small></div><div className="project-decoration"><span></span><span></span><span></span></div><span className="project-label">PROJECT SHOWCASE</span></div>}
      <div className="tag-row">{post.tags.map((t) => <button className={`tag tag-${t.replace(/[^a-z]/g, "")}`} key={t} onClick={() => pickTag(t)}>#{t}</button>)}</div>
    </div>
    <div className="post-actions"><button className={`action ${post.vote === 1 ? "selected heart-selected" : ""}`} onClick={() => vote(post)} aria-label={post.vote === 1 ? "Unlike post" : "Like post"}><Heart size={18} fill={post.vote === 1 ? "currentColor" : "none"} /> <span>{formatNumber(post.likes)}</span><span className="action-label">likes</span></button><button className={`action ${expanded === post.id ? "selected" : ""}`} onClick={() => openComments(post)}><MessageCircle size={18} /><span>{formatNumber(post.commentCount)}</span><span className="action-label">{post.type === "question" ? "answers" : "comments"}</span></button><button className="action share-action" onClick={() => share(post)}><Share2 size={17} /><span className="action-label">Share</span></button><button className={`action bookmark-action ${post.bookmarked ? "selected" : ""}`} onClick={() => bookmark(post)} aria-label={post.bookmarked ? "Remove bookmark" : "Bookmark post"}>{post.bookmarked ? <BookmarkCheck size={18} fill="currentColor" /> : <Bookmark size={18} />}</button></div>
    {expanded === post.id && <div className="comments-panel">
      <div className="comments-heading"><strong>{post.type === "question" ? "Community answers" : "Conversation"}</strong><span>Join in and share what you know</span></div>
      {(commentsByPost[post.id] || []).length === 0 && <p className="empty-comments">No visible replies yet. Start the conversation!</p>}
      {(commentsByPost[post.id] || []).map((comment) => <div className={`comment ${comment.parentId ? "comment-reply" : ""}`} key={comment.id}><Avatar index={comment.author.avatar} size={32} /><div className="comment-main"><div className="comment-meta"><strong>{comment.author.name}</strong><span>· {timeAgo(comment.createdAt)}</span>{post.acceptedCommentId === comment.id && <span className="accepted"><Check size={12} /> Accepted</span>}</div><p>{comment.body}</p><div className="comment-actions"><button className={comment.vote === 1 ? "selected" : ""} onClick={() => voteComment(post.id, comment, 1)}><ArrowUp size={13} /> {comment.score}</button><button className={comment.vote === -1 ? "selected" : ""} onClick={() => voteComment(post.id, comment, -1)} aria-label="Downvote reply"><ArrowDown size={13} /></button><button onClick={() => { setReplyTo(comment); document.getElementById(`reply-${post.id}`)?.focus(); }}>Reply</button>{post.author.id === current.id && post.type === "question" && !comment.parentId && <button onClick={() => acceptComment(post, comment)}>{post.acceptedCommentId === comment.id ? "Unaccept" : "Accept answer"}</button>}{comment.author.id === current.id && <button onClick={() => deleteComment(post, comment)}>Delete</button>}</div></div></div>)}
      {replyTo && <div className="replying-to">Replying to {replyTo.author.name} <button onClick={() => setReplyTo(null)}><X size={13} /></button></div>}
      <form className="comment-form" onSubmit={(e) => sendComment(e, post)}><Avatar index={current.avatar} size={32} /><input id={`reply-${post.id}`} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={post.type === "question" ? "Share your answer..." : "Write a thoughtful reply..."} /><button type="submit" disabled={submitting || !commentText.trim()} aria-label="Send reply"><Send size={16} /></button></form>
    </div>}
  </article>;

  const sectionTitle: Record<Section, [string, string]> = {
    feed: [tr("Community feed"), tr("Your daily dose of ideas, conversations, and inspiration.")],
    questions: [tr("Questions"), tr("Find answers, share knowledge, and learn together.")],
    tags: [tr("Explore tags"), tr("Find the topics and technologies you care about.")],
    members: [tr("Community members"), tr("Meet the people learning and building alongside you.")],
    bookmarks: [tr("Saved posts"), tr("All the good stuff you've saved for later.")],
    activity: [tr("Your activity"), tr("Every contribution makes the community better.")],
    notifications: [tr("Notifications"), tr("Catch up on what’s happening in your community.")],
    profile: [tr("Your profile"), tr("Your journey and contributions, all in one place.")],
    plans: [tr("Find your next level"), tr("More ways to learn, connect, and grow with CodeQuest.")],
    settings: [tr("Settings"), tr("Manage your profile, preferences, and security.")],
    moderation: [tr("Moderation"), tr("Review community reports and keep CodeQuest welcoming.")],
  };

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><button className="mobile-menu icon-button" onClick={() => setNavOpen(!navOpen)} aria-label="Open menu"><Menu size={22} /></button><button className="logo-button" onClick={() => navigate("feed")}><Logo /></button>
      <div className="header-search"><Search size={19} /><input aria-label="Search community" placeholder={tr("Search questions, topics, or people...")} value={search} onChange={(e) => { setSearch(e.target.value); if (!["feed", "questions", "bookmarks"].includes(section)) setSection("feed"); setSharedPost(""); }} /><kbd>⌘ K</kbd></div>
      <div className="top-actions"><button className="button primary top-ask" onClick={() => openCompose("question")}><Plus size={17} strokeWidth={2.4} /> <span>{tr("Ask a question")}</span></button><div className="relative"><button className="top-icon" aria-label="Notifications" onClick={() => { setShowNotifications(!showNotifications); setShowProfileMenu(false); }}><Bell size={20} />{unread > 0 && <span className="notification-dot" />}</button>{showNotifications && <div className="popover notification-popover"><div className="popover-head"><strong>Notifications</strong><button onClick={markRead}>Mark all read</button></div>{notifications.slice(0, 4).map((n) => <button className={`notification-row ${!n.read ? "unread" : ""}`} key={n.id} onClick={() => { setShowNotifications(false); navigate("notifications"); }}><Avatar index={n.actor?.avatar || 0} size={34} /><span><strong>{n.actor?.name || "CodeQuest"}</strong> {n.message}<small>{timeAgo(n.createdAt)}</small></span></button>)}{!notifications.length && <p className="popover-empty">You’re all caught up!</p>}<button className="popover-footer" onClick={() => navigate("notifications")}>View all notifications <ArrowRight size={14} /></button></div>}</div>
      <div className="top-divider" /><div className="relative"><button className="account-button" onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}><Avatar index={current.avatar} size={36} /><span className="account-name">{current.name}</span><ChevronDown size={15} /></button>{showProfileMenu && <div className="small-menu account-menu"><div className="menu-user"><strong>{current.name}</strong><span>@{current.handle} {demo && "· Demo"}</span></div><button onClick={() => navigate("profile")}><Users size={15} /> Your profile</button><button onClick={() => navigate("settings")}><Settings size={15} /> Settings</button><button onClick={() => { setShowProfileMenu(false); setAuthMode("login"); setFormError(""); setModal("auth"); }}><LogIn size={15} /> {demo ? "Sign in / Create account" : "Switch account"}</button>{!demo && <button onClick={logout}><LogOut size={15} /> Sign out</button>}</div>}</div></div>
    </div></header>
    <div className="app-layout">
      <aside className={`left-sidebar ${navOpen ? "mobile-open" : ""}`}><div className="sidebar-scroll"><div className="nav-label">{tr("DISCOVER")}</div><nav className="nav-group">{navItems.map((item) => <NavItem item={item} key={item.section} />)}</nav><div className="nav-label personal-label">{tr("YOUR SPACE")}</div><nav className="nav-group">{personalItems.map((item) => <NavItem item={item} key={item.section} />)}</nav><div className="sidebar-rule" /><button className={`nav-item ${section === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings size={18} strokeWidth={1.8} /><span>{tr("Settings")}</span></button>{current.isAdmin && <button className={`nav-item ${section === "moderation" ? "active" : ""}`} onClick={() => navigate("moderation")}><ShieldCheck size={18} /><span>Moderation</span></button>}
      <div className="upgrade-card"><div className="upgrade-stars"><Sparkles size={19} /></div><div className="upgrade-orb orb-one" /><div className="upgrade-orb orb-two" /><strong>A little more<br />room to grow.</strong><p>Unlock more questions and extra perks with a premium plan.</p><button onClick={() => navigate("plans")}>Explore plans <ArrowRight size={14} /></button></div>
      <div className="sidebar-footer"><span>Made for curious minds <span className="purple-heart">♥</span></span><br />© 2026 CodeQuest</div></div></aside>
      <main className="main-column">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {section === "feed" ? tr("YOUR COMMUNITY") : tr("CODEQUEST COMMUNITY")}</div><h1>{tag ? `#${tag}` : sharedPost ? "Shared post" : sectionTitle[section][0]}</h1><p>{tag ? `Explore posts about ${tag}.` : sharedPost ? "A conversation shared with you." : sectionTitle[section][1]}</p></div>{(section === "questions" || section === "bookmarks") && <button className="button primary heading-action" onClick={() => openCompose("question")}><Plus size={17} /> Ask a question</button>}{(tag || sharedPost) && <button className="button outline heading-action" onClick={() => navigate("feed")}><X size={15} /> Clear filter</button>}</div>
        {section === "feed" && !tag && !sharedPost && <>
          <div className="welcome-banner"><div className="banner-content"><div className="banner-kicker"><Sparkles size={14} /> {tr("A COMMUNITY FOR DEVELOPERS")}</div><h2>{tr("Great things happen")}<br />{tr("when we ")}<em>{tr("build together.")}</em></h2><p>Ask questions, share ideas, and grow alongside<br className="desktop-break" /> developers just like you.</p><button onClick={() => openCompose("question")}>{tr("Ask the community")} <ArrowRight size={15} /></button></div><div className="banner-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-window"><div className="art-window-top"><i /><i /><i /><span /></div><div className="art-window-body"><div className="art-braces">{`{ }`}</div><div className="art-lines"><i /><i /><i /><i /></div></div></div><div className="art-bubble"><MessageCircle size={24} fill="currentColor" /></div><div className="art-star"><Sparkles size={20} fill="currentColor" /></div><div className="art-code">&lt;/&gt;</div><div className="art-small-dot" /></div></div>
          <div className="composer card"><div className="composer-top"><Avatar index={current.avatar} size={40} /><button className="composer-placeholder" onClick={() => openCompose("update")}>{tr("Share something with the community...")}</button><button className="button primary composer-post" onClick={() => openCompose("update")}>{tr("Create post")}</button></div><div className="composer-bottom"><button onClick={() => openCompose("question")}><span className="compose-icon question-icon"><CircleHelp size={16} /></span> Ask a question</button><button onClick={() => openCompose("update")}><span className="compose-icon update-icon"><Pencil size={15} /></span> Share an update</button><button onClick={() => openCompose("project")}><span className="compose-icon project-icon"><Zap size={15} /></span> Showcase a project</button><button className="composer-more" aria-label="Add code" onClick={() => { openCompose("update"); setShowCode(true); }}><Code2 size={17} /></button></div></div>
        </>}
        {section === "profile" && <div className="profile-summary card"><div className="profile-cover" /><div className="profile-content"><Avatar index={current.avatar} size={68} className="profile-avatar" /><button className="button outline" onClick={() => navigate("settings")}><Pencil size={15} /> Edit profile</button><h2>{current.name} <CheckCircle2 size={16} className="verified" /></h2><p>@{current.handle} · {current.headline}</p><p>{current.bio || "Add a little about yourself in settings."}</p><div className="profile-stats"><span><strong>{current.reputation.toLocaleString()}</strong> reputation</span><span><strong className="capitalize">{current.plan}</strong> plan</span></div></div></div>}
        {isFeed && <><div className="feed-heading"><div><h2>{section === "profile" ? "Your posts" : section === "bookmarks" ? "Your collection" : section === "questions" ? "All questions" : tag || sharedPost ? "Posts" : tr("Your feed")}</h2>{section === "feed" && !tag && !sharedPost && <span>{tr("Stories from your community")}</span>}</div>{section === "feed" && !tag && !sharedPost ? <div className="feed-tabs"><button className={tab === "foryou" ? "active" : ""} onClick={() => setTab("foryou")}>{tr("For you")}</button><button className={tab === "following" ? "active" : ""} onClick={() => setTab("following")}>{tr("Following")}</button><button className={tab === "trending" ? "active" : ""} onClick={() => setTab("trending")}>{tr("Trending")}</button></div> : <button className="sort-label" onClick={() => { setTab(tab === "trending" ? "foryou" : "trending"); if (section !== "feed") flash("Showing the newest posts."); }}><SlidersHorizontal size={15} /> Latest <ChevronDown size={14} /></button>}</div>
          {query && <div className="search-result-label">Search results for <strong>“{query}”</strong><button onClick={() => setSearch("")}><X size={14} /> Clear</button></div>}
          <div className="posts-list">{posts.map(renderPost)}{loading && <div className="loading-state"><LoaderCircle size={20} className="spin" /> Loading your community...</div>}{!loading && posts.length === 0 && <div className="empty-state card"><div className="empty-icon"><MessageSquare size={24} /></div><h3>Nothing here just yet</h3><p>{section === "bookmarks" ? "Save a post and you’ll find it here when you need it." : tab === "following" ? "Follow a few members to make this space your own." : "Try another search or start a new conversation."}</p><button className="button primary" onClick={() => section === "bookmarks" || tab === "following" ? navigate("feed") : openCompose("question")}>{section === "bookmarks" || tab === "following" ? "Explore the feed" : "Start a conversation"}</button></div>}{hasMore && <div ref={sentinel} className="load-more"><button onClick={() => loadFeed(page + 1, true)} disabled={loading}>Load more posts <ChevronDown size={15} /></button></div>}</div></>}
        {section === "tags" && <div className="tag-grid">{tagItems.map((item, i) => <button className="tag-tile card" key={item.tag} onClick={() => pickTag(item.tag)}><span className={`tag-square color-${i % 5}`}><Hash size={20} /></span><span><strong>#{item.tag}</strong><small>{item.count} {item.count === 1 ? "post" : "posts"} in the community</small></span><ArrowUpRight size={17} /></button>)}</div>}
        {section === "members" && <div className="members-grid">{members.map((member) => <div className="member-tile card" key={member.id}><Avatar index={member.avatar} size={54} /><div className="member-tile-copy"><strong>{member.name} {member.reputation >= 4000 && <CheckCircle2 size={13} className="verified" />}</strong><span>{member.headline}</span><small><Trophy size={13} /> {member.reputation.toLocaleString()} reputation</small></div><button className={`follow-button ${member.following ? "is-following" : ""}`} onClick={() => follow(member.id)}>{member.following ? <><Check size={13} /> Following</> : <><Plus size={14} /> Follow</>}</button></div>)}</div>}
        {section === "notifications" && <div className="content-card card"><div className="content-card-heading"><div><h2>Your notifications</h2><p>All the latest from your network.</p></div><button className="text-link" onClick={markRead}>Mark all as read</button></div>{notifications.length ? notifications.map((n) => <div className={`notification-list-row ${!n.read ? "unread" : ""}`} key={n.id}><Avatar index={n.actor?.avatar || 0} size={42} /><div><p><strong>{n.actor?.name || "CodeQuest"}</strong> {n.message}</p><span>{timeAgo(n.createdAt)}</span></div>{!n.read && <i />}</div>) : <p className="section-empty">You’re all caught up. Check back later!</p>}</div>}
        {section === "activity" && <><div className="reputation-hero card"><div className="rep-icon"><Trophy size={25} /></div><div><span>YOUR REPUTATION</span><strong>{current.reputation.toLocaleString()} <small>points</small></strong><p>Every helpful contribution counts. Keep it up!</p></div><button className="button outline" onClick={() => { setFormError(""); setModal("transfer"); }}>Transfer points <ArrowUpRight size={15} /></button></div><div className="content-card card"><div className="content-card-heading"><div><h2>Community privileges</h2><p>Good things unlock when you contribute.</p></div></div><div className="privileges">{[{ points: 50, name: "Comment freely" }, { points: 100, name: "Edit community posts" }, { points: 250, name: "Vote to close questions" }, { points: 500, name: "Report content" }].map((p) => <div className="privilege" key={p.points}><span className={current.reputation >= p.points ? "unlocked" : ""}>{current.reputation >= p.points ? <Check size={15} /> : <ShieldCheck size={15} />}</span><div><strong>{p.name}</strong><small>{p.points} reputation</small></div><b>{current.reputation >= p.points ? "Unlocked" : "Locked"}</b></div>)}</div></div><div className="content-card card"><div className="content-card-heading"><div><h2>Reputation history</h2><p>A record of the impact you’ve made.</p></div></div>{activity.length ? activity.map((event) => <div className="activity-row" key={event.id}><span className={event.delta >= 0 ? "positive" : "negative"}>{event.delta > 0 ? "+" : ""}{event.delta}</span><div><strong>{event.reason}</strong><small>{timeAgo(event.createdAt)}</small></div></div>) : <p className="section-empty">Your reputation activity will appear here.</p>}</div></>}
        {section === "plans" && <><div className="plans-intro"><div className="plans-icon"><Crown size={24} /></div><div><strong>Invest in your curiosity.</strong><p>Choose the plan that fits your learning journey. All prices are per month.</p></div></div><div className="plans-grid">{[{ id: "free", name: "Free", price: "0", description: "A great place to start.", features: ["1 question per day", "Basic search", "Community access"] }, { id: "bronze", name: "Bronze", price: "99", description: "For the curious builder.", features: ["5 questions per day", "Bronze profile badge", "Advanced search filters"] }, { id: "silver", name: "Silver", price: "299", description: "For the growing developer.", features: ["15 questions per day", "Silver profile badge", "Priority support", "Unlimited bookmarks"] }, { id: "gold", name: "Gold", price: "999", description: "For the dedicated expert.", features: ["Unlimited questions", "Gold profile badge", "Featured profile visibility", "Exclusive community perks"] }].map((plan) => <div className={`plan-card card ${plan.id === "silver" ? "recommended" : ""}`} key={plan.id}>{plan.id === "silver" && <span className="popular-label">MOST POPULAR</span>}<div className={`plan-gem ${plan.id}`}><Crown size={19} /></div><h3>{plan.name}</h3><p>{plan.description}</p><div className="price">₹{plan.price}<small>/ month</small></div><button className={`button ${plan.id === "silver" ? "primary" : "outline"}`} disabled={submitting || plan.id === "free" || current.plan === plan.id} onClick={() => startBilling(plan.id)}>{current.plan === plan.id ? "Current plan" : plan.id === "free" ? "Included" : "Choose " + plan.name}</button><div className="plan-features">{plan.features.map((feature) => <span key={feature}><Check size={15} />{feature}</span>)}</div></div>)}</div><p className="billing-note"><ShieldCheck size={15} /> Secure checkout and invoices are provided by Stripe when billing is configured.</p></>}
        {section === "settings" && <><form className="content-card card settings-card" onSubmit={saveProfile}><div className="content-card-heading"><div><h2>Profile details</h2><p>Let the community get to know you.</p></div><Avatar index={current.avatar} size={46} /></div><div className="form-grid"><label>Display name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label><label>Headline<input value={profile.headline} onChange={(e) => setProfile({ ...profile, headline: e.target.value })} required /></label><label className="full-width">About you<textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} placeholder="A little about what you're building..." /></label><label className="full-width">Phone number <span className="optional">(international format)</span><input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+14155552671" /></label></div><button className="button primary" disabled={submitting}>Save changes</button></form><div className="content-card card settings-card"><div className="content-card-heading"><div><h2>Language preference</h2><p>Changing your language requires verification. French uses email; all others use SMS.</p></div><Globe2 size={21} className="muted-icon" /></div><div className="inline-form"><select value={language} onChange={(e) => { setLanguage(e.target.value); setLanguageSent(false); }}><option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option><option value="pt">Português</option><option value="zh">中文</option><option value="fr">Français</option></select><button className="button outline" disabled={submitting || language === current.locale} onClick={requestLanguage}>Send verification code</button></div>{languageSent && <div className="inline-form language-verify"><input value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} placeholder="6-digit code" maxLength={6} /><button className="button primary" onClick={verifyLanguage}>Verify and save</button></div>}<p className="hint">Email and SMS delivery require provider credentials. Community content remains in its original language.</p></div><div className="content-card card settings-card"><div className="content-card-heading"><div><h2>Active sessions</h2><p>Manage devices signed in to your account.</p></div><ShieldCheck size={21} className="muted-icon" /></div>{sessions.map((item) => <div className="session-row" key={item.id}><div><strong>{item.current ? "This device" : "Other device"} {item.current && <span className="current-session">Current</span>}</strong><small>{item.browser} on {item.os} · {item.device} · IP: {item.ip} · {item.location}</small></div><button className="text-link" onClick={() => revokeSession(item)}>Revoke</button></div>)}{!sessions.length && <p className="section-empty">No active sessions to display.</p>}</div><div className="content-card card settings-card"><div className="content-card-heading"><div><h2>Subscription & billing</h2><p>Current plan: <strong className="capitalize">{current.plan}</strong> · {current.subscriptionStatus || "inactive"}</p></div><button className="button outline" onClick={() => current.plan === "free" ? navigate("plans") : startBilling()}> {current.plan === "free" ? "Explore plans" : "Manage billing"} <ArrowUpRight size={14} /></button></div>{invoices.map((invoice) => <div className="invoice-row" key={invoice.id}><span>{invoice.number || "Invoice"} · {new Date(invoice.created * 1000).toLocaleDateString()}</span><strong>{invoice.currency.toUpperCase()} {(invoice.amount / 100).toFixed(2)}</strong>{invoice.pdf && <a href={invoice.pdf} target="_blank" rel="noreferrer">Download</a>}</div>)}{!invoices.length && <p className="hint">Your invoices and billing history will appear here after payment.</p>}</div></>}
        {section === "moderation" && <><div className="content-card card"><div className="content-card-heading"><div><h2>Reported posts</h2><p>Review reports and choose a moderation action.</p></div></div>{reports.length ? reports.map((report) => <div className="report-row" key={report.id}><div><strong>{report.postTitle}</strong><p>{report.reason}</p><small>Reported by {report.reporter.name} · {report.status}</small></div>{report.status === "pending" && <div className="report-actions">{["dismiss", "remove", "suspend"].map((action) => <button className="text-link" key={action} onClick={async () => { try { await community(`reports/${report.id}`, "PATCH", { action }); setRevision((v) => v + 1); flash("Report reviewed."); } catch (error) { flash(error instanceof Error ? error.message : "Could not review report."); } }}>{action}</button>)}</div>}</div>) : <p className="section-empty">No reports to review.</p>}</div><div className="content-card card"><div className="content-card-heading"><div><h2>Recent login activity</h2><p>Security activity across community accounts.</p></div></div>{loginActivity.map((item, i) => <div className="session-row" key={`${item.handle}-${i}`}><div><strong>{item.name} · @{item.handle}</strong><small>{item.browser} on {item.os} · {item.device} · {item.ip} · {item.location} · {timeAgo(item.createdAt)}</small></div></div>)}</div></>}
      </main>
      <aside className="right-sidebar"><div className="right-card profile-mini card"><div className="right-card-heading"><h3>{tr("Your profile")}</h3><button onClick={() => navigate("profile")}>{tr("View profile")} <ArrowUpRight size={13} /></button></div><div className="mini-user"><Avatar index={current.avatar} size={48} /><div><strong>{current.name}</strong><span>@{current.handle}{demo && " · Demo account"}</span></div><span className="mini-plan">{current.plan}</span></div><div className="mini-stats"><div><span className="stat-icon"><Trophy size={15} /></span><div><strong>{current.reputation.toLocaleString()}</strong><small>Reputation</small></div></div><div><span className="stat-icon lavender"><Award size={15} /></span><div><strong>{current.plan === "free" ? "Free" : current.plan}</strong><small>Current plan</small></div></div></div><div className="profile-progress"><div><span>Keep growing your impact</span><strong>{Math.min(100, Math.round((current.reputation % 1500) / 15))}%</strong></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.round((current.reputation % 1500) / 15))}%` }} /></div></div></div>
        <div className="right-card trending-card card"><div className="right-card-heading"><div><h3>{tr("Trending tags")} <span className="heading-spark">✦</span></h3><p>What the community is talking about</p></div><button onClick={() => navigate("tags")}>{tr("View all")}</button></div><div className="trending-list">{tagItems.slice(0, 5).map((item, i) => <button className="trending-row" key={item.tag} onClick={() => pickTag(item.tag)}><span className={`tag-square color-${i % 5}`}><Hash size={17} /></span><span className="trending-text"><strong>{item.tag}</strong><small>{item.count} {item.count === 1 ? "post" : "posts"}</small></span><TrendingUp size={15} className="trend-arrow" /></button>)}</div></div>
        <div className="right-card follow-card card"><div className="right-card-heading"><div><h3>{tr("Who to follow")}</h3><p>Connect with fellow builders</p></div><button onClick={() => navigate("members")}>{tr("View all")}</button></div><div className="follow-list">{members.slice(0, 3).map((member) => <div className="follow-row" key={member.id}><Avatar index={member.avatar} size={38} /><div><strong>{member.name}</strong><small>{member.headline}</small></div><button className={member.following ? "followed-icon" : "follow-icon"} aria-label={member.following ? `Unfollow ${member.name}` : `Follow ${member.name}`} onClick={() => follow(member.id)}>{member.following ? <Check size={15} /> : <Plus size={16} />}</button></div>)}</div></div>
        <div className="community-note"><div className="note-icon"><Lightbulb size={17} /></div><div><strong>Better together.</strong><p>Be curious, be kind, and help someone learn today.</p><button onClick={() => setModal("guidelines")}>Community guidelines <ArrowRight size={13} /></button></div></div><div className="right-footer">About <span>·</span> Guidelines <span>·</span> Privacy <span>·</span> Terms<br />© 2026 CodeQuest. Built for builders.</div>
      </aside>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} /> {toast}</div>}
    {modal === "compose" && <Dialog title={editing ? "Edit post" : compose.type === "question" ? "Ask the community" : compose.type === "project" ? "Showcase your project" : "Share an update"} subtitle="Good conversations start with a little curiosity." onClose={() => setModal(null)} wide><form onSubmit={submitPost} className="modal-form"><div className="type-selector">{[{ value: "question", label: "Question", icon: CircleHelp }, { value: "update", label: "Update", icon: MessageSquare }, { value: "project", label: "Project", icon: Zap }].map((type) => <button type="button" className={compose.type === type.value ? "active" : ""} key={type.value} onClick={() => setCompose({ ...compose, type: type.value })}><type.icon size={15} />{type.label}</button>)}</div><label>Title<input autoFocus value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} maxLength={180} placeholder={compose.type === "question" ? "What would you like to know?" : "Give your post a title"} required /></label><label>Details<textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} rows={5} maxLength={10000} placeholder="Share a little more with the community..." required /></label><label>Tags <span className="optional">(up to 5, separated by commas)</span><input value={compose.tags} onChange={(e) => setCompose({ ...compose, tags: e.target.value })} placeholder="react, javascript, beginners" /></label>{showCode && <label>Code snippet<textarea className="mono-input" value={compose.code} onChange={(e) => setCompose({ ...compose, code: e.target.value })} rows={3} placeholder="Paste your code here..." /></label>}{showImage && <label>Image URL<input value={compose.imageUrl} onChange={(e) => setCompose({ ...compose, imageUrl: e.target.value })} placeholder="https://example.com/image.jpg" /></label>}<div className="compose-extras"><button type="button" onClick={() => setShowCode(!showCode)}><FileCode2 size={16} /> {showCode ? "Hide code" : "Add code"}</button><button type="button" onClick={() => setShowImage(!showImage)}><ImagePlus size={16} /> {showImage ? "Hide image" : "Add image"}</button></div>{formError && <div className="form-error">{formError}</div>}<div className="modal-actions"><button type="button" className="button outline" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={submitting}>{submitting ? "Saving..." : editing ? "Save changes" : "Publish post"} <ArrowRight size={15} /></button></div></form></Dialog>}
    {modal === "auth" && <Dialog title={authChallenge ? "Verify this device" : authMode === "signup" ? "Join the community" : "Welcome back"} subtitle={authChallenge ? "Enter the six-digit code sent to your registered contact." : authMode === "signup" ? "Make a little space for your curiosity." : "Sign in to continue your journey."} onClose={() => user ? setModal(null) : undefined}><form className="modal-form" onSubmit={submitAuth}>{authChallenge ? <><label>Verification code<input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="000000" required /></label><button className="generate-password" type="button" onClick={() => { setAuthChallenge(null); setFormError(""); }}>Back to sign in</button></> : <><div className="auth-tabs"><button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setFormError(""); }}>Create account</button><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setFormError(""); }}>Sign in</button></div>{authMode === "signup" ? <><label>Display name<input value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} placeholder="Your name" required /></label><label>Username<input value={auth.handle} onChange={(e) => setAuth({ ...auth, handle: e.target.value })} placeholder="yourusername" required /></label><label>Email address<input type="email" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} placeholder="you@example.com" required /></label></> : <label>Email or username<input value={auth.identifier} onChange={(e) => setAuth({ ...auth, identifier: e.target.value })} placeholder="you@example.com" required /></label>}<label>Password<input type="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} placeholder="At least 8 characters" required /></label>{authMode === "login" && <><label className="checkbox-label"><input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} /> Remember this device</label><a className="forgot-link" href="/forgot-password">Forgot password?</a></>}</>}{formError && <div className="form-error">{formError}</div>}<button className="button primary full-button" disabled={submitting}>{submitting ? "Just a moment..." : authChallenge ? "Verify and sign in" : authMode === "signup" ? "Create account" : "Sign in"} <ArrowRight size={16} /></button>{demo && <p className="hint">You’re currently exploring a shared demo account. Create your own account to keep your activity private.</p>}</form></Dialog>}
    {modal === "report" && <Dialog title="Report this post" subtitle="Help us keep CodeQuest helpful and welcoming." onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitReport}><label>What should our moderators know?<textarea rows={4} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Tell us why this post should be reviewed..." required /></label>{formError && <div className="form-error">{formError}</div>}<div className="modal-actions"><button type="button" className="button outline" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={submitting}>Send report</button></div></form></Dialog>}
    {modal === "transfer" && <Dialog title="Transfer reputation" subtitle="Recognize someone who made a difference." onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitTransfer}><label>Member<select value={transfer.receiverId} onChange={(e) => setTransfer({ ...transfer, receiverId: e.target.value })} required><option value="">Choose a community member</option>{members.map((m) => <option value={m.id} key={m.id}>{m.name} (@{m.handle})</option>)}</select></label><label>Points <span className="optional">(maximum 50 per transfer)</span><input type="number" min="1" max="50" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} required /></label><label>Reason<input value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} placeholder="Say thanks for something specific" required /></label><p className="hint">You can transfer up to 100 points per day and must have more than 50 reputation.</p>{formError && <div className="form-error">{formError}</div>}<div className="modal-actions"><button type="button" className="button outline" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={submitting}>Transfer points</button></div></form></Dialog>}
    {modal === "guidelines" && <Dialog title="A better community, together" subtitle="A few little things that make a big difference." onClose={() => setModal(null)}><div className="guidelines"><p><strong>Be kind.</strong> There’s a person behind every question.</p><p><strong>Share what you know.</strong> Helpful answers are better than perfect ones.</p><p><strong>Stay curious.</strong> Ask clearly, give context, and welcome different perspectives.</p><p><strong>Keep it safe.</strong> Report spam, harassment, or anything that doesn’t belong.</p><button className="button primary" onClick={() => setModal(null)}>Sounds good <Check size={16} /></button></div></Dialog>}
    {!ready && <div className="boot-indicator"><LoaderCircle size={15} className="spin" /> Connecting...</div>}
  </div>;
}
