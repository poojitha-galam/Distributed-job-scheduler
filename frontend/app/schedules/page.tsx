"use client";

import { useCallback, useEffect, useState } from "react";
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

function shortId(id: string) { return id.slice(0, 8); }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
}

export default function Schedules() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetchApi(`/schedules/`);
      if (res.ok) { const d = await res.json(); setSchedules(d.items || []); }
    } catch { }
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
    try {
      await fetchApi(`/schedules/${scheduleId}`, { method: "DELETE" });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem" }}>Schedules</h1>
          <p className="text-secondary">Manage recurring cron jobs.</p>
        </div>
      </div>

      <div className="neu-table-wrapper">
        <table className="neu-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Cron</th>
              <th>Status</th>
              <th>Next Run</th>
              <th>Last Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "40px" }} className="text-secondary">
                  No recurring schedules created yet.
                </td>
              </tr>
            )}
            {schedules.map((s, idx) => (
              <tr key={s.id} className={`animate-fade-in-up animate-delay-${(idx % 3) + 1}`}>
                <td className="fw-semibold text-secondary">#{shortId(s.id)}</td>
                <td className="fw-bold text-primary">{s.name}</td>
                <td className="fw-semibold text-primary" style={{ fontFamily: "monospace" }}>{s.cron_expression}</td>
                <td>
                  <span className={`badge ${s.enabled ? "badge-success" : "badge-secondary"}`}>
                    {s.enabled ? "ACTIVE" : "PAUSED"}
                  </span>
                </td>
                <td className="text-secondary">{fmtDate(s.next_run_at)}</td>
                <td className="text-secondary">{fmtDate(s.last_run_at)}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => togglePause(s.id, s.enabled)} className="neu-button" style={{ padding: "4px 12px" }}>
                      {s.enabled ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => deleteSchedule(s.id)} className="neu-button" style={{ padding: "4px 12px", color: "var(--danger-color)" }}>
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
  );
}
