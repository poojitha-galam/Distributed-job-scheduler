"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

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

function shortId(id: string) {
  return id.slice(0, 8);
}

function fmtDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString();
}

export default function Schedules() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetchApi(`/schedules/`);
      if (res.ok) { const d = await res.json(); setSchedules(d.items || []); }
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
  }, [fetchSchedules, router]);

  async function togglePause(scheduleId: string, enabled: boolean) {
    try {
      await fetchApi(`/schedules/${scheduleId}/${enabled ? "pause" : "resume"}`, { method: "POST" });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      await fetchApi(`/schedules/${scheduleId}`, { method: "DELETE" });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <TopNav />

        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recurring Schedules</h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
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
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                      No recurring schedules created yet.
                    </td>
                  </tr>
                )}
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{shortId(s.id)}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-200">{s.name}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">{s.cron_expression}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                        s.enabled 
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {s.enabled ? "ACTIVE" : "PAUSED"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{fmtDate(s.next_run_at)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{fmtDate(s.last_run_at)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{fmtDate(s.created_at)}</td>
                    <td className="px-5 py-3.5 flex gap-2">
                      <button
                        onClick={() => togglePause(s.id, s.enabled)}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {s.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => deleteSchedule(s.id)}
                        className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
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
      </div>
    </main>
  );
}
