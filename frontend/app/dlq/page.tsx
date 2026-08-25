"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";

interface DLQJob {
  id: string;
  job_id: string;
  failure_reason: string;
  attempt_count: number;
  first_failed_at: string;
  last_failed_at: string;
}

function shortId(id: string) { return id.slice(0, 8); }
function fmtDate(iso: string | null) { 
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
}

export default function DLQPage() {
  const router = useRouter();
  const [dlqJobs, setDlqJobs] = useState<DLQJob[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchApi(`/dlq/`);
      if (res.ok) {
        const d = await res.json();
        setDlqJobs(d.items || []);
      }
    } catch { }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [fetchData, router]);

  async function handleRetryDlq(dlqId: string) {
    try {
      await fetchApi(`/dlq/${dlqId}/retry`, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error("Retry failed:", err);
    }
  }

  return (
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem", color: "var(--danger-color)" }}>Dead Letter Queue (DLQ)</h1>
          <p className="text-secondary">Manage and retry jobs that have exhausted all retry attempts.</p>
        </div>
      </div>

      <div className="neu-table-wrapper">
        <table className="neu-table">
          <thead>
            <tr>
              <th>DLQ ID</th>
              <th>Original Job ID</th>
              <th>Failure Reason</th>
              <th>Failed At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dlqJobs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px" }} className="text-secondary">Dead Letter Queue is empty. 🎉</td></tr>
            )}
            {dlqJobs.map((dj, idx) => (
              <tr key={dj.id} className={`animate-fade-in-up animate-delay-${(idx % 3) + 1}`}>
                <td className="fw-semibold text-secondary">#{shortId(dj.id)}</td>
                <td className="fw-semibold text-primary">
                  <Link href={`/jobs/${dj.job_id}`}>#{shortId(dj.job_id)}</Link>
                </td>
                <td className="text-danger fw-semibold" style={{ maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {dj.failure_reason}
                </td>
                <td className="text-secondary">{fmtDate(dj.last_failed_at)}</td>
                <td>
                  <button onClick={() => handleRetryDlq(dj.id)} className="neu-button primary" style={{ padding: "6px 12px", fontSize: "0.9rem" }}>
                    Retry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
