"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Code2, KeyRound, Sparkles } from "lucide-react";

function generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower = "abcdefghijklmnopqrstuvwxyz", all = upper + lower;
  const randomIndex = (max: number) => {
    const values = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  };
  const chars = [upper[randomIndex(upper.length)], lower[randomIndex(lower.length)]];
  for (let i = 0; i < 22; i++) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export default function ForgotPasswordPage() {
  const [token, setToken] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/auth?action=${token ? "reset" : "forgot"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { token, password } : { identifier }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong.");
      setMessage(token ? "Your password has been updated. You can now sign in with your new password." : data.message);
      if (token) setPassword("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setLoading(false); }
  }
  return <main className="auth-page"><a href="/" aria-label="CodeQuest home"><div className="brand"><span className="brand-mark"><Code2 size={22} strokeWidth={2.8} /></span><span>Code<span className="brand-accent">Quest</span><span className="brand-dot">.</span></span></div></a><div className="reset-card card"><div className="reset-icon"><KeyRound size={23} /></div><h1>{token ? "Choose a new password" : "Forgot your password?"}</h1><p>{token ? "Create a new password to get back to your community." : "No worries. Enter your registered email address or phone number and we’ll send you a reset link."}</p>{message ? <div className="reset-success">{message}</div> : <form className="modal-form" onSubmit={submit}>{token ? <><label>New password<input type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} maxLength={72} required /></label><button type="button" className="generate-password" onClick={() => { setPassword(generatePassword()); setVisible(true); }}><Sparkles size={14} /> Generate a 24-letter password</button><p className="hint">Generated passwords contain uppercase and lowercase letters only. Save your password somewhere safe.</p></> : <label>Email or phone number<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or +14155552671" required /></label>}{error && <div className="form-error">{error}</div>}<button className="button primary full-button" disabled={loading}>{loading ? "Please wait..." : token ? "Reset password" : "Send reset link"} <ArrowRight size={16} /></button>{!token && <p className="hint">For your security, reset requests are limited to once per day. Email or SMS delivery must be configured by the site administrator.</p>}</form>}<a className="back-link" href="/"><ArrowLeft size={14} /> Back to CodeQuest</a></div></main>;
}
