"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";

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
  QUEUED: "bg-gray-500/20 text-gray-300 border border-gray-500/30",
  CLAIMED: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  RUNNING: "bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse",
  COMPLETED: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  FAILED: "bg-red-500/20 text-red-300 border border-red-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_STYLES[status] ?? "bg-gray-700 text-gray-300"}`}>
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
    return <div className="p-10 text-gray-400">Loading...</div>;
  }

  if (error || !job) {
    return <div className="p-10 text-red-400">{error || "Job not found"}</div>;
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-medium text-blue-400 hover:text-blue-300 mb-6 inline-flex items-center gap-1">
          ← Back to Dashboard
        </Link>
        
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 backdrop-blur">
          <div className="mb-6 border-b border-gray-800 pb-6">
            <h1 className="text-2xl font-bold text-white mb-2">Job: {job.name}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
              <div><span className="font-semibold text-gray-500 uppercase text-xs tracking-wider">Status:</span> <StatusBadge status={job.status} /></div>
              <div><span className="font-semibold text-gray-500 uppercase text-xs tracking-wider">Queue:</span> {job.queue_name || "\u2014"}</div>
              <div><span className="font-semibold text-gray-500 uppercase text-xs tracking-wider">Worker:</span> {job.claimed_by || "\u2014"}</div>
            </div>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-800 pb-2">Timeline</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-gray-800/50 pb-2"><dt className="text-gray-500">Created</dt><dd className="text-gray-200">{fmtDate(job.created_at)}</dd></div>
                <div className="flex justify-between border-b border-gray-800/50 pb-2"><dt className="text-gray-500">Started</dt><dd className="text-gray-200">{fmtDate(job.started_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Completed</dt><dd className="text-gray-200">{fmtDate(job.completed_at)}</dd></div>
              </dl>
            </div>
            
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-800 pb-2">Execution</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-gray-800/50 pb-2"><dt className="text-gray-500">Attempts</dt><dd className="text-gray-200">{job.attempt_count} / {job.max_attempts} (max)</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Retry Policy</dt><dd className="text-gray-200">{job.retry_policy}</dd></div>
              </dl>
            </div>
          </div>
          
          {(job.last_error || job.error) && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-800 pb-2">Last Error</h2>
              <pre className="p-4 bg-gray-950 rounded-lg text-red-400 text-xs overflow-auto font-mono whitespace-pre-wrap border border-red-900/30">
                {job.error || job.last_error}
              </pre>
            </div>
          )}
          
          {job.status === "FAILED" && (
            <div className="mt-8 pt-6 border-t border-gray-800">
              <button 
                onClick={handleRetry} 
                disabled={retrying}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-50"
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
