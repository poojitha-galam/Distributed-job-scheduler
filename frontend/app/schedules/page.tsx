"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";

interface ScheduledJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  cron_expression: string;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
}

// const API = "http://localhost:8000/api/v1";

function shortId(id: string) {
  return id.slice(0, 8);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function Schedules() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetchApi(`/schedules/`);
      if (res.ok) setSchedules(await res.json());
    } catch {
      // backend not reachable
    }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchSchedules();
    const id = setInterval(fetchSchedules, 2000);
    return () => clearInterval(id);
  }, [fetchSchedules]);

  async function togglePause(scheduleId: string, enabled: boolean) {
    try {
      await fetchApi(`/schedules/${scheduleId}/${enabled ? "pause" : "resume"}`, { method: "POST" });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    try {
      await fetchApi(`/schedules/${scheduleId}`, { method: "DELETE" });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Job Scheduler
            </h1>
            <div className="mt-2 flex gap-4 text-sm font-medium">
              <Link href="/" className="text-gray-400 hover:text-gray-200 transition pb-1">Jobs</Link>
              <Link href="/schedules" className="text-blue-400 border-b border-blue-400 pb-1">Schedules</Link>
              <Link href="/queues" className="text-gray-400 hover:text-gray-200 transition pb-1">Queues</Link>
              <Link href="/settings/api-keys" className="text-gray-400 hover:text-gray-200 transition pb-1">API Keys</Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Cron</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Next Run</th>
                <th className="px-5 py-3">Last Run</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-600">
                    No recurring schedules created yet.
                  </td>
                </tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-800/50 transition hover:bg-gray-800/40">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{shortId(s.id)}</td>
                  <td className="px-5 py-3 font-medium text-gray-200">{s.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-blue-300">{s.cron_expression}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
                      s.enabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                    }`}>
                      {s.enabled ? "ACTIVE" : "PAUSED"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{fmtDate(s.next_run_at)}</td>
                  <td className="px-5 py-3 text-gray-400">{fmtDate(s.last_run_at)}</td>
                  <td className="px-5 py-3 text-gray-400">{fmtDate(s.created_at)}</td>
                  <td className="px-5 py-3 flex gap-2">
                    <button
                      onClick={() => togglePause(s.id, s.enabled)}
                      className="rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition"
                    >
                      {s.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => deleteSchedule(s.id)}
                      className="rounded bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-800 hover:text-white transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
