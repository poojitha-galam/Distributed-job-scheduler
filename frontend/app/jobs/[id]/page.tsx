"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

interface Job {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  status: "QUEUED" | "CLAIMED" | "RUNNING" | "COMPLETED" | "FAILED";
  claimed_by: string | null;
  result: unknown;
  error: string | null;
  scheduled_at: string | null;
  is_recurring: boolean;
  cron_expression: string | null;
  schedule_id: string | null;
  queue_id: string | null;
  queue_name: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  retry_policy: string;
  last_error: string | null;
  next_retry_at: string | null;
  ai_summary: {
    severity: string;
    transience: string;
    root_cause: string;
    suggested_fix: string;
  } | null;
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50 border",
  CLAIMED: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/30 border",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30 border",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/30 border",
  FAILED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/30 border",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleString() : "\u2014"; }

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchApi(`/jobs/${id}`);
      if (res.ok) {
        setJob(await res.json());
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.detail || "Failed to load job");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [fetchData, router]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetchApi(`/dlq/${id}/retry`, { method: "POST" });
      await fetchData();
    } catch (err: any) {
      alert("Retry failed: " + err.message);
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-8"><div className="mx-auto max-w-6xl"><TopNav /><div className="p-10 text-slate-500 dark:text-slate-400">Loading...</div></div></main>
    );
  }

  if (error || !job) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-8"><div className="mx-auto max-w-6xl"><TopNav /><div className="p-10 text-red-600 dark:text-red-400">{error || "Job not found"}</div></div></main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <TopNav />

        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
            ← Back to Dashboard
          </Link>
        </div>
        
        <div className="rounded-2xl glass-card p-8">
          <div className="mb-8 border-b border-slate-200/60 pb-6 dark:border-slate-800/60">
            <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg glow-blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              </span>
              Job: <span className="font-mono text-indigo-600 dark:text-indigo-400">{job.name}</span>
            </h1>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-600 dark:text-slate-400 pl-11">
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</span> <div><StatusBadge status={job.status} /></div></div>
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Queue</span> <span className="font-medium text-slate-900 dark:text-slate-200">{job.queue_name || "\u2014"}</span></div>
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Worker</span> <span className="font-mono">{job.claimed_by || "\u2014"}</span></div>
            </div>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="mb-4 border-b border-slate-200/60 pb-2 text-sm font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800/60">Timeline</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-slate-100/50 pb-3 dark:border-slate-800/30"><dt className="text-slate-500 dark:text-slate-400 font-medium">Created</dt><dd className="font-semibold text-slate-900 dark:text-slate-200">{fmtDate(job.created_at)}</dd></div>
                <div className="flex justify-between border-b border-slate-100/50 pb-3 dark:border-slate-800/30"><dt className="text-slate-500 dark:text-slate-400 font-medium">Started</dt><dd className="font-semibold text-slate-900 dark:text-slate-200">{fmtDate(job.started_at)}</dd></div>
                <div className="flex justify-between pb-3"><dt className="text-slate-500 dark:text-slate-400 font-medium">Completed</dt><dd className="font-semibold text-slate-900 dark:text-slate-200">{fmtDate(job.completed_at)}</dd></div>
              </dl>
            </div>
            
            <div>
              <h2 className="mb-4 border-b border-slate-200/60 pb-2 text-sm font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800/60">Execution</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-slate-100/50 pb-3 dark:border-slate-800/30"><dt className="text-slate-500 dark:text-slate-400 font-medium">Attempts</dt><dd className="font-semibold text-slate-900 dark:text-slate-200">{job.attempt_count} / {job.max_attempts} (max)</dd></div>
                <div className="flex justify-between pb-3"><dt className="text-slate-500 dark:text-slate-400 font-medium">Retry Policy</dt><dd className="font-semibold text-slate-900 dark:text-slate-200">{job.retry_policy}</dd></div>
              </dl>
            </div>
          </div>
          
          {(job.last_error || job.error) && (
            <div className="mt-8 rounded-xl border border-red-200/50 bg-red-50/50 p-6 dark:border-red-900/30 dark:bg-red-950/20">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-red-600 dark:text-red-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                Last Error
              </h2>
              <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-4 font-mono text-xs font-medium text-red-700 shadow-sm dark:bg-slate-950/50 dark:text-red-400">
                {job.error || job.last_error}
              </pre>
            </div>
          )}

          {job.ai_summary && (
            <div className="mt-8 rounded-xl border border-purple-200/50 bg-purple-50/50 p-6 dark:border-purple-900/30 dark:bg-purple-950/20">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                AI Diagnostic Summary
              </h2>
              <div className="flex flex-col gap-4 rounded-lg bg-white/80 p-5 shadow-sm dark:bg-slate-950/50">
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Severity</span><span className="font-semibold text-purple-700 dark:text-purple-400">{job.ai_summary.severity}</span></div>
                  <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Transience</span><span className="font-semibold text-purple-700 dark:text-purple-400">{job.ai_summary.transience}</span></div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Root Cause</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{job.ai_summary.root_cause}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Suggested Fix</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{job.ai_summary.suggested_fix}</p>
                </div>
              </div>
            </div>
          )}
          
          {job.status === "FAILED" && (
            <div className="mt-8 border-t border-slate-200/60 pt-6 dark:border-slate-800/60">
              <button 
                onClick={handleRetry} 
                disabled={retrying}
                className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-xl disabled:transform-none disabled:opacity-50 glow-blue"
              >
                {retrying ? "Retrying..." : "Retry Job"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
