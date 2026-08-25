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
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CLAIMED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  RUNNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
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
        
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-800">
            <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-slate-100">Job: <span className="font-mono">{job.name}</span></h1>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Status</span> <div><StatusBadge status={job.status} /></div></div>
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Queue</span> <span className="font-medium text-slate-900 dark:text-slate-200">{job.queue_name || "\u2014"}</span></div>
              <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Worker</span> <span className="font-mono">{job.claimed_by || "\u2014"}</span></div>
            </div>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:text-slate-400">Timeline</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-3 dark:border-slate-800/50"><dt className="text-slate-500 dark:text-slate-400">Created</dt><dd className="font-medium text-slate-900 dark:text-slate-200">{fmtDate(job.created_at)}</dd></div>
                <div className="flex justify-between border-b border-slate-100 pb-3 dark:border-slate-800/50"><dt className="text-slate-500 dark:text-slate-400">Started</dt><dd className="font-medium text-slate-900 dark:text-slate-200">{fmtDate(job.started_at)}</dd></div>
                <div className="flex justify-between pb-3"><dt className="text-slate-500 dark:text-slate-400">Completed</dt><dd className="font-medium text-slate-900 dark:text-slate-200">{fmtDate(job.completed_at)}</dd></div>
              </dl>
            </div>
            
            <div>
              <h2 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:text-slate-400">Execution</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-3 dark:border-slate-800/50"><dt className="text-slate-500 dark:text-slate-400">Attempts</dt><dd className="font-medium text-slate-900 dark:text-slate-200">{job.attempt_count} / {job.max_attempts} (max)</dd></div>
                <div className="flex justify-between pb-3"><dt className="text-slate-500 dark:text-slate-400">Retry Policy</dt><dd className="font-medium text-slate-900 dark:text-slate-200">{job.retry_policy}</dd></div>
              </dl>
            </div>
          </div>
          
          {(job.last_error || job.error) && (
            <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900/30 dark:bg-red-950/20">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-red-600 dark:text-red-500">Last Error</h2>
              <pre className="overflow-auto whitespace-pre-wrap rounded bg-white p-4 font-mono text-xs text-red-600 shadow-sm dark:bg-slate-950 dark:text-red-400">
                {job.error || job.last_error}
              </pre>
            </div>
          )}
          
          {job.status === "FAILED" && (
            <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
              <button 
                onClick={handleRetry} 
                disabled={retrying}
                className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
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
