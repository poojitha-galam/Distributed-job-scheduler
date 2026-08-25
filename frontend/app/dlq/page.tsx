"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { Search, AlertOctagon } from "lucide-react";

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

function shortId(id: string) {
  return id.slice(0, 8);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function DeadLetterQueue() {
  const router = useRouter();
  const [jobs, setJobs] = useState<DLQJob[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetchApi(`/dlq/`);
      if (res.ok) { const d = await res.json(); setJobs(d.items || []); }
    } catch {
      // backend not reachable
    }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchJobs();
    const id = setInterval(fetchJobs, 2000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dead Letter Queue</h1>
          <p className="text-sm text-slate-500 mt-1">Jobs that have permanently failed after max attempts</p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-red-600" />
            Failed Jobs
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Here..." 
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-500 w-64 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs font-bold text-slate-900 uppercase bg-white border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Original Job</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">Attempts</th>
                <th className="px-6 py-4">First Failed</th>
                <th className="px-6 py-4">Moved to DLQ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No failed jobs in the DLQ.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{shortId(j.id)}</td>
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900">{shortId(j.job_id)}</td>
                  <td className="px-6 py-4 font-mono text-[10px] text-red-600 max-w-xs truncate" title={j.failure_reason}>
                    {j.failure_reason}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{j.attempt_count}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(j.first_failed_at)}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
