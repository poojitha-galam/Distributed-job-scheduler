"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function JobsPage() {
  const router = useRouter();
  
  // Form State
  const [name, setName] = useState("");
  const [payload, setPayload] = useState('{"fail_times": 0}');
  const [scheduleType, setScheduleType] = useState<"immediate" | "delayed" | "scheduled" | "recurring">("immediate");
  const [runAt, setRunAt] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [selectedQueue, setSelectedQueue] = useState("default");
  
  const [queues, setQueues] = useState<{id: string, name: string}[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueues = useCallback(async () => {
    try {
      const qRes = await fetchApi(`/queues/`);
      if (qRes.ok) {
        const d = await qRes.json();
        setQueues(d.items || []);
      }
    } catch { }
  }, []);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

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
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally { setSubmitting(false); }
  }

  return (
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex items-center gap-4 mb-8">
        <button className="neu-button" onClick={() => router.back()} style={{ padding: "8px" }}>
          ←
        </button>
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem" }}>New Job Posting</h1>
          <p className="text-secondary">Create and schedule a new background task.</p>
        </div>
      </div>

      <div className="neu-box" style={{ maxWidth: "800px" }}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="fw-semibold text-secondary">Job Name</label>
              <input type="text" className="neu-input" placeholder="e.g. daily-report-generation" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="fw-semibold text-secondary">Target Queue</label>
              <select className="neu-input" value={selectedQueue} onChange={e => setSelectedQueue(e.target.value)}>
                {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
                {queues.length === 0 && <option value="default">default</option>}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="fw-semibold text-secondary">Payload (JSON)</label>
            <textarea className="neu-input" rows={4} value={payload} onChange={e => setPayload(e.target.value)} style={{ resize: "none", fontFamily: "monospace" }} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="fw-semibold text-secondary">Schedule Type</label>
              <select className="neu-input" value={scheduleType} onChange={e => setScheduleType(e.target.value as any)}>
                <option value="immediate">Immediate</option>
                <option value="delayed">Delayed</option>
                <option value="scheduled">Scheduled</option>
                <option value="recurring">Recurring (Cron)</option>
              </select>
            </div>

            {(scheduleType === "delayed" || scheduleType === "scheduled") && (
              <div className="flex flex-col gap-2">
                <label className="fw-semibold text-secondary">Run At</label>
                <input type="datetime-local" className="neu-input" value={runAt} onChange={e => setRunAt(e.target.value)} required />
              </div>
            )}

            {scheduleType === "recurring" && (
              <div className="flex flex-col gap-2">
                <label className="fw-semibold text-secondary">Cron Expression</label>
                <input type="text" className="neu-input" placeholder="*/5 * * * *" value={cronExpression} onChange={e => setCronExpression(e.target.value)} required />
              </div>
            )}
          </div>

          {error && <div className="text-danger fw-semibold mt-2">{error}</div>}

          <div className="flex justify-end gap-4 mt-4">
            <button type="button" className="neu-button" onClick={() => router.back()}>Cancel</button>
            <button type="submit" className="neu-button primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
