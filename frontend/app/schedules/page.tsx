"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { Search, Calendar } from "lucide-react";

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
  if (!iso) return "—";
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
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Schedules</h1>
          <p className="text-sm text-slate-500 mt-1">Manage recurring cron jobs</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
          + New Schedule
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Recurring Schedules
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Here..." 
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs font-bold text-slate-900 uppercase bg-white border-b border-slate-100">
              <tr>
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
            <tbody className="divide-y divide-slate-100">
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No recurring schedules created yet.
                  </td>
                </tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{shortId(s.id)}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{s.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-600 font-semibold">{s.cron_expression}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide ${
                      s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {s.enabled ? "ACTIVE" : "PAUSED"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(s.next_run_at)}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(s.last_run_at)}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(s.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => togglePause(s.id, s.enabled)}
                        className="rounded bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition border border-slate-200"
                      >
                        {s.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => deleteSchedule(s.id)}
                        className="rounded bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition border border-red-100"
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
  );
}
