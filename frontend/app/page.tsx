"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Job {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  status: string;
  queue_name?: string | null;
  claimed_by?: string | null;
  created_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  scheduled_at?: string | null;
  is_recurring?: boolean;
  next_retry_at?: string | null;
}

interface DLQJob {
  id: string;
  job_id: string;
  failure_reason: string;
  last_failed_at: string | null;
}

interface QueueOption {
  id: string;
  name: string;
}

interface WorkerStatus {
  worker_id: string;
  status: string;
  last_heartbeat: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50 border",
  CLAIMED: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/30 border",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30 border",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/30 border",
  FAILED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/30 border",
};

const TYPE_STYLES: Record<string, string> = {
  IMMEDIATE: "bg-slate-100/80 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50",
  SCHEDULED: "bg-blue-50/80 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30",
  RECURRING: "bg-fuchsia-50/80 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-300 dark:border-fuchsia-800/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold tracking-widest ${TYPE_STYLES[type] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"}`}>
      {type}
    </span>
  );
}

function shortId(id: string) { return id.slice(0, 8); }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleString() : "\u2014"; }
function getJobType(job: Job) {
  if (job.is_recurring) return "RECURRING";
  if (job.scheduled_at) return "SCHEDULED";
  return "IMMEDIATE";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Home() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dlqJobs, setDlqJobs] = useState<DLQJob[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);

  // Form State
  const [name, setName] = useState("");
  const [payload, setPayload] = useState('{"fail_times": 0}');
  const [scheduleType, setScheduleType] = useState<"immediate" | "delayed" | "scheduled" | "recurring">("immediate");
  const [runAt, setRunAt] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [selectedQueue, setSelectedQueue] = useState("default");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, dlqRes, qRes, wRes] = await Promise.all([
        fetchApi(`/jobs/`),
        fetchApi(`/dlq/`),
        fetchApi(`/queues/`),
        fetchApi(`/workers/status`),
      ]);
      if (jobsRes.ok) { const d = await jobsRes.json(); setJobs(d.items || []); }
      if (dlqRes.ok) { const d = await dlqRes.json(); setDlqJobs(d.items || []); }
      if (qRes.ok) {
        const d = await qRes.json();
        setQueues(d.items || []);
        if (d.items?.length > 0) setSelectedQueue(d.items[0].name);
      }
      if (wRes.ok) setWorkers(await wRes.json());
    } catch { }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchData();
    
    // Connect to WebSocket for live updates
    const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") || "ws://localhost:8000";
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/dashboard`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.job_id && data.status) {
          // Update the specific job in state to avoid full refetch if possible,
          // but for now, just trigger a quick refetch to keep it simple and accurate
          fetchData();
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    };
    
    // Fallback polling
    const id = setInterval(fetchData, 10000);
    return () => {
      clearInterval(id);
      ws.close();
    };
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let parsedPayload: Record<string, unknown>;
    try { parsedPayload = JSON.parse(payload); } catch { setError("Payload must be valid JSON"); return; }

    setSubmitting(true);
    try {
      let endpoint = "/jobs/";
      let body: any = { name, payload: parsedPayload, queue_name: selectedQueue };

      if (scheduleType === "delayed" || scheduleType === "scheduled") {
        if (!runAt) throw new Error("Run At time is required");
        endpoint = "/jobs/scheduled/";
        body.scheduled_at = new Date(runAt).toISOString();
      } else if (scheduleType === "recurring") {
        if (!cronExpression) throw new Error("Cron Expression is required");
        endpoint = "/schedules/";
        body.cron_expression = cronExpression;
      }

      const res = await fetchApi(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `HTTP ${res.status}`);
      }
      setName(""); setPayload('{"fail_times": 0}'); setRunAt(""); setCronExpression(""); setScheduleType("immediate");
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally { setSubmitting(false); }
  }

  async function handleRetryDlq(dlqId: string) {
    try { await fetchApi(`/dlq/${dlqId}/retry`, { method: "POST" }); await fetchData(); } catch (err) { console.error("Retry failed:", err); }
  }

  const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1400px]">
        <TopNav />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start">
          {/* LEFT COLUMN: Controls & Stats */}
          <div className="flex flex-col gap-6 xl:col-span-4">
            {/* Status Metrics */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-2">
              {(["QUEUED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED"] as const).map(s => {
                const isCompleted = s === "COMPLETED";
                const isFailed = s === "FAILED";
                return (
                  <div key={s} className={`flex flex-col rounded-2xl glass-card p-4 relative overflow-hidden group`}>
                    <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full blur-2xl opacity-20 transition-opacity duration-500 group-hover:opacity-40 ${isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 z-10">{s}</span>
                    <span className={`mt-1 text-3xl font-extrabold tracking-tight z-10 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : isFailed ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      {counts[s] ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Create-job form */}
            <form onSubmit={handleSubmit} className="rounded-2xl glass-card p-5">
              <div className="mb-5 flex items-center gap-3 border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">New Job</h2>
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Job Name</label>
                  <input type="text" placeholder="e.g. data_export" value={name} onChange={e => setName(e.target.value)} required
                    className="rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-medium text-slate-900 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-900" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Payload</label>
                  <textarea placeholder='{"key": "value"}' value={payload} onChange={e => setPayload(e.target.value)} rows={2}
                    className="resize-none rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-mono font-medium text-slate-900 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-900" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Queue</label>
                    <select value={selectedQueue} onChange={e => setSelectedQueue(e.target.value)}
                      className="rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900">
                      {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
                      {queues.length === 0 && <option value="default">default</option>}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Type</label>
                    <select value={scheduleType} onChange={e => setScheduleType(e.target.value as any)}
                      className="rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900">
                      <option value="immediate">Immediate</option>
                      <option value="delayed">Delayed</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="recurring">Recurring</option>
                    </select>
                  </div>
                </div>

                {(scheduleType === "delayed" || scheduleType === "scheduled") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Run At</label>
                    <input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} required
                      className="rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900" />
                  </div>
                )}

                {scheduleType === "recurring" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Cron Expr</label>
                    <input type="text" placeholder="*/5 * * * *" value={cronExpression} onChange={e => setCronExpression(e.target.value)} required
                      className="rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm font-mono font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900" />
                  </div>
                )}

                <button type="submit" disabled={submitting}
                  className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-xl disabled:transform-none disabled:opacity-50 glow-blue">
                  {submitting ? "Submitting..." : "Submit Job"}
                </button>
              </div>
              {error && <p className="mt-4 text-xs font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800/30">{error}</p>}
            </form>

            {/* Worker Status Panel */}
            <div className="rounded-2xl glass-card p-5">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Workers</h2>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{workers.length} Active</span>
              </div>
              <div className="flex flex-col gap-3">
                {workers.map(w => (
                  <div key={w.worker_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/50 p-3 shadow-sm dark:border-slate-700/50 dark:bg-slate-800/50">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{shortId(w.worker_id)}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {w.last_heartbeat ? `Ping ${Math.round((Date.now() - new Date(w.last_heartbeat).getTime()) / 1000)}s` : "No ping"}
                      </span>
                    </div>
                    <span className={`flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest uppercase ${w.status === "ONLINE" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>
                      <span className={`h-2 w-2 rounded-full ${w.status === "ONLINE" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] dark:bg-emerald-400" : "bg-slate-400"}`} />
                      {w.status}
                    </span>
                  </div>
                ))}
                {workers.length === 0 && <div className="text-xs font-medium text-slate-500 p-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center">No active workers</div>}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Jobs & DLQ Tables */}
          <div className="flex flex-col gap-6 xl:col-span-8">
            {/* Jobs table */}
            <div className="rounded-2xl glass-card overflow-hidden flex flex-col max-h-[800px]">
              <div className="flex items-center justify-between border-b border-slate-200/60 p-5 dark:border-slate-800/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Active Jobs</h2>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">{jobs.length} total</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                    <tr className="border-b border-slate-200/60 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                      <th className="px-5 py-3">ID</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Queue</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-sm font-medium text-slate-500">No jobs yet.</td></tr>
                    )}
                    {jobs.map(job => (
                      <tr key={job.id} className="border-b border-slate-100/50 transition-colors hover:bg-slate-50/80 dark:border-slate-800/30 dark:hover:bg-slate-800/40 group">
                        <td className="px-5 py-3.5 font-mono text-xs font-medium text-slate-500 transition-colors group-hover:text-blue-600 dark:text-slate-400">
                          <Link href={`/jobs/${job.id}`}>{shortId(job.id)}</Link>
                        </td>
                        <td className="px-5 py-3.5"><TypeBadge type={getJobType(job)} /></td>
                        <td className="px-5 py-3.5 font-semibold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-200 truncate max-w-[150px]">
                          <Link href={`/jobs/${job.id}`}>{job.name}</Link>
                        </td>
                        <td className="px-5 py-3.5 text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">{job.queue_name || "\u2014"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={job.status} />
                            {job.status === "QUEUED" && job.next_retry_at && (
                              <span className="text-[9px] text-amber-600 font-bold uppercase">({Math.max(0, Math.round((new Date(job.next_retry_at).getTime() - Date.now()) / 1000))}s)</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DLQ table */}
            {dlqJobs.length > 0 && (
              <div className="rounded-2xl glass-card border border-red-200/50 dark:border-red-900/30 overflow-hidden shadow-lg shadow-red-500/5 flex flex-col max-h-[400px]">
                <div className="flex items-center justify-between border-b border-red-100/50 bg-red-50/50 p-5 dark:border-red-900/30 dark:bg-red-950/20 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400 glow-red">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-red-800 dark:text-red-200">Dead Letter Queue</h2>
                  </div>
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2.5 py-0.5 rounded-full">{dlqJobs.length} items</span>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="sticky top-0 z-10 bg-red-50/90 dark:bg-red-950/90 backdrop-blur-md">
                      <tr className="border-b border-red-100/50 text-[10px] font-bold uppercase tracking-widest text-red-700/70 dark:border-red-900/30 dark:text-red-400/70">
                        <th className="px-5 py-3">ID</th>
                        <th className="px-5 py-3">Error</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dlqJobs.map(job => (
                        <tr key={job.id} className="border-b border-red-50/50 transition-colors hover:bg-red-50/80 dark:border-red-900/20 dark:hover:bg-red-900/40">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Link href={`/jobs/${job.job_id}`} className="hover:text-red-500">{shortId(job.job_id)}</Link>
                          </td>
                          <td className="px-5 py-3 text-[11px] font-mono font-medium text-red-600 dark:text-red-400 max-w-[250px] truncate" title={job.failure_reason}>
                            {job.failure_reason || "Unknown error"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button 
                              onClick={() => handleRetryDlq(job.id)}
                              className="rounded-lg bg-red-100 px-3 py-1.5 text-[10px] font-bold text-red-700 shadow-sm transition hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/60 uppercase tracking-wider"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Auto-refreshes every 2s</p>
      </div>
    </main>
  );
}
}
