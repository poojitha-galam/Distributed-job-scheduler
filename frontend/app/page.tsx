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
  queue_name: string | null;
  created_at: string;
  next_retry_at: string | null;
}

interface WorkerStatus {
  worker_id: string;
  status: "ONLINE" | "OFFLINE" | "IDLE";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED: "badge-secondary",
    CLAIMED: "badge-warning",
    RUNNING: "badge-primary",
    COMPLETED: "badge-success",
    FAILED: "badge-danger",
  };
  return <span className={`badge ${map[status] || "badge-secondary"}`}>{status}</span>;
}

function shortId(id: string) { return id.slice(0, 8); }
function fmtDate(iso: string | null) { 
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function DashboardHome() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queuesCount, setQueuesCount] = useState(0);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [dlqCount, setDlqCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, dlqRes, qRes, wRes] = await Promise.all([
        fetchApi(`/jobs/`),
        fetchApi(`/dlq/`),
        fetchApi(`/queues/`),
        fetchApi(`/workers/status`),
      ]);
      if (jobsRes.ok) { const d = await jobsRes.json(); setJobs(d.items || []); }
      if (dlqRes.ok) { const d = await dlqRes.json(); setDlqCount((d.items || []).length); }
      if (qRes.ok) { const d = await qRes.json(); setQueuesCount((d.items || []).length); }
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
  }, [fetchData, router]);

  const activeJobs = jobs.filter(j => j.status === 'RUNNING' || j.status === 'CLAIMED' || j.status === 'QUEUED').length;
  const onlineWorkers = workers.filter(w => w.status === 'ONLINE').length;

  return (
    <div style={{ paddingBottom: "40px" }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem" }}>Dashboard</h1>
          <p className="text-secondary">Manage your active jobs efficiently</p>
        </div>
        <Link href="/jobs">
          <button className="neu-button primary">
            + New Job Posting
          </button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="flex gap-6 mb-8 flex-wrap">
        <div className="neu-box flex items-center justify-between" style={{ flex: 1, minWidth: "220px" }}>
          <div>
            <div className="text-secondary fw-semibold">Active Jobs</div>
            <div className="fw-bold" style={{ fontSize: "2rem" }}>{activeJobs}</div>
            <div className="text-muted">Total items in flight</div>
          </div>
          <div style={{ fontSize: "2.5rem" }}>💼</div>
        </div>

        <div className="neu-box flex items-center justify-between" style={{ flex: 1, minWidth: "220px" }}>
          <div>
            <div className="text-secondary fw-semibold">Active Workers</div>
            <div className="fw-bold" style={{ fontSize: "2rem" }}>{onlineWorkers}</div>
            <div className="text-muted">Polling across {queuesCount} queues</div>
          </div>
          <div style={{ fontSize: "2.5rem" }}>🤖</div>
        </div>

        <div className="neu-box flex items-center justify-between" style={{ flex: 1, minWidth: "220px" }}>
          <div>
            <div className="text-secondary fw-semibold">Failed Jobs</div>
            <div className="fw-bold text-danger" style={{ fontSize: "2rem", color: "var(--danger-color)" }}>{dlqCount}</div>
            <div className="text-muted">Requires attention (DLQ)</div>
          </div>
          <div style={{ fontSize: "2.5rem" }}>🚨</div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="fw-bold" style={{ fontSize: "1.4rem" }}>All Job Posting List</h2>
        <span className="text-secondary" style={{ fontSize: "0.9rem" }}>Showing {jobs.length} items</span>
      </div>

      <div className="neu-table-wrapper">
        <table className="neu-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Name</th>
              <th>Queue</th>
              <th>Status</th>
              <th>Created On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px" }} className="text-secondary">No jobs found.</td></tr>
            )}
            {jobs.map((job, idx) => (
              <tr key={job.id} className={`animate-fade-in-up animate-delay-${(idx % 3) + 1}`}>
                <td className="fw-semibold text-secondary">#{shortId(job.id)}</td>
                <td className="fw-bold text-primary">{job.name}</td>
                <td><span className="badge badge-secondary">{job.queue_name || 'default'}</span></td>
                <td><StatusBadge status={job.status} /></td>
                <td className="text-secondary">{fmtDate(job.created_at)}</td>
                <td>
                  <Link href={`/jobs/${job.id}`}>
                    <button className="neu-button" style={{ padding: "6px 12px", fontSize: "0.9rem" }}>View</button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
