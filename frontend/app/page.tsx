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
  QUEUED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CLAIMED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  RUNNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const TYPE_STYLES: Record<string, string> = {
  IMMEDIATE: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50",
  RECURRING: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800/50",
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
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
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
      <div className="mx-auto max-w-6xl">
        <TopNav />

        {/* Status Metrics */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {(["QUEUED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED"] as const).map(s => (
            <div key={s} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400">{s}</span>
              <span className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{counts[s] ?? 0}</span>
            </div>
          ))}
        </div>

        {/* Create-job form */}
        <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">New Job / Schedule</h2>
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Job Name</label>
                <input type="text" placeholder="e.g. data_export" value={name} onChange={e => setName(e.target.value)} required
                  className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Payload</label>
                <textarea placeholder='{"key": "value"}' value={payload} onChange={e => setPayload(e.target.value)} rows={1}
                  className="resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500" />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Queue</label>
                <select value={selectedQueue} onChange={e => setSelectedQueue(e.target.value)}
                  className="w-40 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
                  {queues.length === 0 && <option value="default">default</option>}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Schedule Type</label>
                <select value={scheduleType} onChange={e => setScheduleType(e.target.value as any)}
                  className="w-40 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="immediate">Immediate</option>
                  <option value="delayed">Delayed</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>

              {(scheduleType === "delayed" || scheduleType === "scheduled") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Run At</label>
                  <input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} required
                    className="w-56 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                </div>
              )}

              {scheduleType === "recurring" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Cron Expression</label>
                  <input type="text" placeholder="*/5 * * * *" value={cronExpression} onChange={e => setCronExpression(e.target.value)} required
                    className="w-40 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500" />
                </div>
              )}

              <div className="flex-1"></div>
              <button type="submit" disabled={submitting}
                className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-500 dark:text-red-400">{error}</p>}
        </form>

        {/* Worker Status Panel */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Workers</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{workers.length} workers</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {workers.map(w => (
              <div key={w.worker_id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-200">{w.worker_id}</span>
                  <span className={`flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase ${w.status === "ONLINE" ? "text-emerald-600 dark:text-emerald-400" : w.status === "OFFLINE" ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                    <span className={`h-2 w-2 rounded-full ${w.status === "ONLINE" ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-400 dark:bg-slate-500"}`} />
                    {w.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {w.last_heartbeat ? `Heartbeat ${Math.round((Date.now() - new Date(w.last_heartbeat).getTime()) / 1000)}s ago` : "No recent activity"}
                </div>
              </div>
            ))}
            {workers.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">Loading worker status...</div>}
          </div>
        </div>

        {/* Jobs table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Jobs</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{jobs.length} jobs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Queue</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Worker</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">No jobs yet.</td></tr>
                )}
                {jobs.map(job => (
                  <tr key={job.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      <Link href={`/jobs/${job.id}`} className="hover:text-blue-600 dark:hover:text-blue-400">{shortId(job.id)}</Link>
                    </td>
                    <td className="px-5 py-3.5"><TypeBadge type={getJobType(job)} /></td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-200">
                      <Link href={`/jobs/${job.id}`} className="hover:text-blue-600 dark:hover:text-blue-400">{job.name}</Link>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400 font-mono">{job.queue_name || "\u2014"}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={job.status} />
                      {job.status === "FAILED" && <span className="ml-2 text-[10px] text-red-600 dark:text-red-400 font-semibold tracking-wide uppercase">(In DLQ)</span>}
                      {job.status === "QUEUED" && job.next_retry_at && (
                        <span className="ml-2 text-[10px] text-yellow-600 dark:text-yellow-500 font-semibold tracking-wide uppercase">
                          (Retry in {Math.max(0, Math.round((new Date(job.next_retry_at).getTime() - Date.now()) / 1000))}s)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs font-mono">{job.claimed_by || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DLQ table */}
        <div className="mt-8 rounded-xl border border-red-200 bg-white shadow-sm dark:border-red-900/30 dark:bg-slate-900">
          <div className="border-b border-red-100 p-5 dark:border-red-900/30">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-red-600 dark:text-red-500">Dead Letter Queue</h2>
          </div>
          {dlqJobs.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No failed jobs are currently in the Dead Letter Queue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-red-100 bg-red-50/50 text-xs font-semibold uppercase tracking-widest text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    <th className="px-5 py-3">DLQ ID</th>
                    <th className="px-5 py-3">Job ID</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3">Failed At</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dlqJobs.map(dj => (
                    <tr key={dj.id} className="border-b border-slate-100 transition-colors hover:bg-red-50 dark:border-slate-800/50 dark:hover:bg-red-950/30">
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{shortId(dj.id)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{shortId(dj.job_id)}</td>
                      <td className="px-5 py-3 text-red-600 dark:text-red-400 text-xs">{dj.failure_reason}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{fmtDate(dj.last_failed_at)}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleRetryDlq(dj.id)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">Auto-refreshes every 2 s</p>
      </div>
    </main>
  );
}
