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

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recurring Schedules</h2>
          </div>
        </div>

        <div className="rounded-2xl glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/50 text-xs font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/30 dark:text-slate-400">
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Cron</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Next Run</th>
                  <th className="px-6 py-4">Last Run</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                      No recurring schedules created yet.
                    </td>
                  </tr>
                )}
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100/50 transition-colors hover:bg-slate-50/50 dark:border-slate-800/30 dark:hover:bg-slate-800/30 group">
                    <td className="px-6 py-4 font-mono text-xs font-medium text-slate-500 transition-colors group-hover:text-fuchsia-600 dark:text-slate-400 dark:group-hover:text-fuchsia-400">{shortId(s.id)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900 transition-colors group-hover:text-fuchsia-600 dark:text-slate-200 dark:group-hover:text-fuchsia-400">{s.name}</td>
                    <td className="px-6 py-4 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">{s.cron_expression}</td>
                    <td className="px-6 py-4">
                      {s.enabled ? (
                        <span className="flex w-max items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> Active
                        </span>
                      ) : (
                        <span className="flex w-max items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Paused
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{fmtDate(s.next_run_at)}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{fmtDate(s.last_run_at)}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{fmtDate(s.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => togglePause(s.id, s.enabled)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                        >
                          {s.enabled ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/60 transition"
                        >
                          Delete
                        </button>
                      </div>
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
