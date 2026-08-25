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

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleString() : "\u2014"; }

interface JobExecution {
  id: string;
  attempt_number: number;
  worker_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [jobRes, execRes] = await Promise.all([
        fetchApi(`/jobs/${id}`),
        fetchApi(`/jobs/${id}/executions`)
      ]);
      
      if (jobRes.ok) {
        setJob(await jobRes.json());
      } else {
        const err = await jobRes.json().catch(() => null);
        setError(err?.detail || "Failed to load job");
      }
      
      if (execRes.ok) {
        setExecutions(await execRes.json());
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

  if (loading) return <div className="p-6 text-secondary animate-fade-in-up">Loading...</div>;
  if (error || !job) return <div className="p-6 text-danger fw-bold animate-fade-in-up">{error || "Job not found"}</div>;

  return (
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex items-center gap-4 mb-8">
        <button className="neu-button" onClick={() => router.back()} style={{ padding: "8px" }}>
          ←
        </button>
        <div>
          <h1 className="fw-bold text-primary" style={{ fontSize: "1.8rem" }}>Job: {job.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-secondary fw-semibold">ID: #{id.split('-')[0]}</span>
            <StatusBadge status={job.status} />
          </div>
        </div>
      </div>
      
      <div className="neu-box" style={{ maxWidth: "1000px" }}>
        <div className="grid gap-6 sm:grid-cols-3 mb-6 border-b" style={{ borderColor: 'var(--border-color)', paddingBottom: '24px' }}>
          <div>
            <div className="text-secondary text-sm fw-semibold uppercase tracking-wider mb-1">Queue</div>
            <div className="fw-bold">{job.queue_name || "\u2014"}</div>
          </div>
          <div>
            <div className="text-secondary text-sm fw-semibold uppercase tracking-wider mb-1">Worker</div>
            <div className="fw-bold">{job.claimed_by || "\u2014"}</div>
          </div>
          <div>
            <div className="text-secondary text-sm fw-semibold uppercase tracking-wider mb-1">Schedule Type</div>
            <div className="fw-bold">{job.is_recurring ? "Recurring" : job.scheduled_at ? "Scheduled" : "Immediate"}</div>
          </div>
        </div>
        
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="neu-card">
            <h2 className="text-primary fw-bold mb-4" style={{ fontSize: "1.2rem" }}>Timeline</h2>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between border-b" style={{ borderColor: 'var(--border-color)', paddingBottom: '8px' }}><span className="text-secondary fw-semibold">Created</span><span className="fw-bold">{fmtDate(job.created_at)}</span></div>
              <div className="flex justify-between border-b" style={{ borderColor: 'var(--border-color)', paddingBottom: '8px' }}><span className="text-secondary fw-semibold">Started</span><span className="fw-bold">{fmtDate(job.started_at)}</span></div>
              <div className="flex justify-between"><span className="text-secondary fw-semibold">Completed</span><span className="fw-bold">{fmtDate(job.completed_at)}</span></div>
            </div>
          </div>
          
          <div className="neu-card">
            <h2 className="text-primary fw-bold mb-4" style={{ fontSize: "1.2rem" }}>Configuration</h2>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between border-b" style={{ borderColor: 'var(--border-color)', paddingBottom: '8px' }}><span className="text-secondary fw-semibold">Attempts</span><span className="fw-bold">{job.attempt_count} / {job.max_attempts}</span></div>
              <div className="flex justify-between border-b" style={{ borderColor: 'var(--border-color)', paddingBottom: '8px' }}><span className="text-secondary fw-semibold">Retry Policy</span><span className="fw-bold">{job.retry_policy}</span></div>
            </div>
          </div>
        </div>
        
        <div className="mt-8">
          <h2 className="text-primary fw-bold mb-4" style={{ fontSize: "1.2rem" }}>Execution History</h2>
          {executions.length === 0 ? (
            <div className="neu-card text-center text-secondary">No execution history available.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {executions.map((ex, idx) => (
                <div key={ex.id} className={`neu-card flex flex-col gap-3 animate-fade-in-up animate-delay-${(idx % 3) + 1}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="fw-bold text-primary">Attempt {ex.attempt_number}</span>
                      <StatusBadge status={ex.status} />
                    </div>
                    <span className="text-muted fw-bold">Worker: {ex.worker_id}</span>
                  </div>
                  <div className="flex gap-6 text-sm text-secondary">
                    <div>Started: <span className="fw-bold">{fmtDate(ex.started_at)}</span></div>
                    {ex.completed_at && <div>Completed: <span className="fw-bold">{fmtDate(ex.completed_at)}</span></div>}
                  </div>
                  {ex.error && (
                    <div className="neu-input" style={{ color: "var(--danger-color)", fontSize: "0.9rem", fontFamily: "monospace", marginTop: "8px" }}>
                      {ex.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {job.status === "FAILED" && (
          <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button 
              onClick={handleRetry} 
              disabled={retrying}
              className="neu-button primary"
            >
              {retrying ? "Retrying..." : "Retry Job (DLQ)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
