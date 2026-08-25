"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BASE_URL } from "@/lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("cws_token", data.access_token);

      // Fetch /me to get project_id
      const meRes = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.projects && meData.projects.length > 0) {
          localStorage.setItem("cws_project_id", meData.projects[0].id);
        }
      }

      router.push("/");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 sm:px-8 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[128px] mix-blend-screen pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[128px] mix-blend-screen pointer-events-none"></div>

      <form onSubmit={handleSubmit} className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-slate-700/80">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg glow-blue mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome Back</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to your Job Scheduler account</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5 relative group">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 group-focus-within:text-blue-400 transition-colors">Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
              className="rounded-xl border border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:bg-slate-900 focus:ring-1 focus:ring-blue-500 hover:border-slate-600" />
          </div>
          <div className="flex flex-col gap-1.5 relative group">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 group-focus-within:text-blue-400 transition-colors">Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
              className="rounded-xl border border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:bg-slate-900 focus:ring-1 focus:ring-blue-500 hover:border-slate-600" />
          </div>
          
          {error && (
            <div className="rounded-lg bg-red-900/30 px-4 py-3 text-sm font-medium text-red-400 border border-red-900/50 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {error}
            </div>
          )}
          
          <button type="submit" className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-blue-500/25 active:scale-[0.98]">
            Sign In
          </button>
        </div>
        <p className="mt-8 text-center text-sm text-slate-400">
          Don't have an account? <Link href="/register" className="font-semibold text-blue-400 hover:text-blue-300 transition-colors">Register here</Link>
        </p>
      </form>
    </main>
  );
}
