"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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
  next_retry_at: string | null;
}

interface DLQJob {
  id: string;
  job_id: string;
  failure_reason: string;
  attempt_count: number;
  first_failed_at: string;
  last_failed_at: string;
  payload_snapshot: Record<string, unknown>;
  created_at: string;
}

interface QueueOption {
  id: string;
  name: string;
}

interface WorkerStatus {
  worker_id: string;
  status: "ONLINE" | "OFFLINE" | "IDLE";
  current_job_id: string | null;
  last_heartbeat: string | null;
}

// const API = "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-gray-500/20 text-gray-300 border border-gray-500/30",
  CLAIMED: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  RUNNING: "bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse",
  COMPLETED: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  FAILED: "bg-red-500/20 text-red-300 border border-red-500/30",
};

const TYPE_STYLES: Record<string, string> = {
  IMMEDIATE: "bg-gray-700/50 text-gray-300 border border-gray-600/50",
  SCHEDULED: "bg-blue-700/50 text-blue-300 border border-blue-600/50",
  RECURRING: "bg-fuchsia-700/50 text-fuchsia-300 border border-fuchsia-600/50",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_STYLES[status] ?? "bg-gray-700 text-gray-300"}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-widest ${TYPE_STYLES[type] ?? "bg-gray-700 text-gray-300"}`}>
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
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (dlqRes.ok) setDlqJobs(await dlqRes.json());
      if (qRes.ok) {
        const qs = await qRes.json();
        setQueues(qs.map((q: any) => ({ id: q.id, name: q.name })));
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
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Job Scheduler</h1>
            <div className="mt-2 flex gap-4 text-sm font-medium">
              <Link href="/" className="text-blue-400 border-b border-blue-400 pb-1">Jobs</Link>
              <Link href="/schedules" className="text-gray-400 hover:text-gray-200 transition pb-1">Schedules</Link>
              <Link href="/queues" className="text-gray-400 hover:text-gray-200 transition pb-1">Queues</Link>
              <Link href="/settings/api-keys" className="text-gray-400 hover:text-gray-200 transition pb-1">API Keys</Link>
            </div>
          </div>
          <div className="flex gap-3 text-xs font-medium">
            {(["QUEUED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED"] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <StatusBadge status={s} />
                <span className="text-gray-500">{counts[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Create-job form */}
        <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-gray-800 bg-gray-900/60 p-5 backdrop-blur">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">New Job / Schedule</h2>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <input type="text" placeholder="Job name" value={name} onChange={e => setName(e.target.value)} required
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              <textarea placeholder='{"key": "value"}' value={payload} onChange={e => setPayload(e.target.value)} rows={1}
                className="resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="flex flex-wrap items-end gap-4 border-t border-gray-800 pt-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Queue</label>
                <select value={selectedQueue} onChange={e => setSelectedQueue(e.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-blue-500">
                  {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
                  {queues.length === 0 && <option value="default">default</option>}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Schedule Type</label>
                <select value={scheduleType} onChange={e => setScheduleType(e.target.value as any)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-blue-500">
                  <option value="immediate">Immediate</option>
                  <option value="delayed">Delayed</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>

              {(scheduleType === "delayed" || scheduleType === "scheduled") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Run At</label>
                  <input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} required
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-blue-500" />
                </div>
              )}

              {scheduleType === "recurring" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Cron Expression</label>
                  <input type="text" placeholder="*/5 * * * *" value={cronExpression} onChange={e => setCronExpression(e.target.value)} required
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-gray-100 outline-none transition focus:border-blue-500" />
                </div>
              )}

              <div className="flex-1"></div>
              <button type="submit" disabled={submitting}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </form>

        {/* Worker Status Panel */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 p-5 backdrop-blur">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">Workers</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {workers.map(w => (
              <div key={w.worker_id} className="flex flex-col gap-1 rounded-lg border border-gray-800 bg-gray-800/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-gray-200">{w.worker_id}</span>
                  <span className={`text-[10px] font-bold tracking-widest uppercase ${w.status === "ONLINE" ? "text-emerald-400" : w.status === "OFFLINE" ? "text-red-400" : "text-gray-400"}`}>
                    {w.status === "ONLINE" ? "● " : w.status === "OFFLINE" ? "○ " : "○ "}{w.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {w.last_heartbeat ? `last seen ${Math.round((Date.now() - new Date(w.last_heartbeat).getTime()) / 1000)}s ago` : "No recent activity"}
                </div>
              </div>
            ))}
            {workers.length === 0 && <div className="text-sm text-gray-500">Loading worker status...</div>}
          </div>
        </div>

        {/* Jobs table */}
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Queue</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-600">No jobs yet -- submit one above.</td></tr>
              )}
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-gray-800/50 transition hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    <Link href={`/jobs/${job.id}`} className="hover:text-blue-400 transition-colors">{shortId(job.id)}</Link>
                  </td>
                  <td className="px-4 py-3"><TypeBadge type={getJobType(job)} /></td>
                  <td className="px-4 py-3 font-medium text-gray-200">
                    <Link href={`/jobs/${job.id}`} className="hover:text-blue-400 transition-colors">{job.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-blue-300 font-mono">{job.queue_name || "\u2014"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                    {job.status === "FAILED" && <span className="ml-2 text-[10px] text-red-500/70 font-semibold tracking-wide uppercase">(In DLQ)</span>}
                    {job.status === "QUEUED" && job.next_retry_at && (
                      <span className="ml-2 text-[10px] text-yellow-500/70 font-semibold tracking-wide uppercase">
                        (Retry in {Math.max(0, Math.round((new Date(job.next_retry_at).getTime() - Date.now()) / 1000))}s)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{job.claimed_by || "\u2014"}</td>
                  <td className="px-4 py-3 text-gray-400">{fmtDate(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* DLQ table */}
        <div className="mt-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-red-950/20 text-xs uppercase tracking-widest text-red-500/80">
                <th className="px-5 py-3">DLQ ID</th>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Failed At</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {dlqJobs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-600">Dead Letter Queue is empty.</td></tr>
              )}
              {dlqJobs.map(dj => (
                <tr key={dj.id} className="border-b border-gray-800/50 transition hover:bg-gray-800/40">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{shortId(dj.id)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{shortId(dj.job_id)}</td>
                  <td className="px-5 py-3 text-red-400 text-xs">{dj.failure_reason}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(dj.last_failed_at)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleRetryDlq(dj.id)}
                      className="rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition">
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">Auto-refreshes every 2 s</p>
      </div>
    </main>
  );
}
