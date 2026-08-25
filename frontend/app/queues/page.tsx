"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";

interface QueueData {
  id: string;
  name: string;
  priority: number;
  concurrency_limit: number;
  paused: boolean;
  retry_policy: string;
  max_attempts: number;
  stats: {
    queued: number;
    claimed: number;
    running: number;
    completed: number;
    failed: number;
  };
  created_at: string;
  updated_at: string;
}

export default function Queues() {
  const router = useRouter();
  const [queues, setQueues] = useState<QueueData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New queue form
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState(0);
  const [newConcurrency, setNewConcurrency] = useState(10);
  const [error, setError] = useState<string | null>(null);

  // Edit form
  const [editPriority, setEditPriority] = useState(0);
  const [editConcurrency, setEditConcurrency] = useState(10);

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetchApi(`/queues/`);
      if (res.ok) { const d = await res.json(); setQueues(d.items || []); }
    } catch { }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    fetchQueues();
    const id = setInterval(fetchQueues, 2000);
    return () => clearInterval(id);
  }, [fetchQueues, router]);

  async function createQueue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetchApi(`/queues/`, {
        method: "POST",
        body: JSON.stringify({ name: newName, priority: newPriority, concurrency_limit: newConcurrency }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail || `HTTP ${res.status}`);
      }
      setNewName("");
      setNewPriority(0);
      setNewConcurrency(10);
      setShowForm(false);
      fetchQueues();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function togglePause(q: QueueData) {
    await fetchApi(`/queues/${q.id}/${q.paused ? "resume" : "pause"}`, { method: "POST" });
    fetchQueues();
  }

  async function deleteQueue(q: QueueData) {
    const res = await fetchApi(`/queues/${q.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Delete failed");
    }
    fetchQueues();
  }

  async function saveEdit(queueId: string) {
    await fetchApi(`/queues/${queueId}`, {
      method: "PATCH",
      body: JSON.stringify({ priority: editPriority, concurrency_limit: editConcurrency }),
    });
    setEditingId(null);
    fetchQueues();
  }

  function startEdit(q: QueueData) {
    setEditingId(q.id);
    setEditPriority(q.priority);
    setEditConcurrency(q.concurrency_limit);
  }

  return (
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem" }}>Queue Management</h1>
          <p className="text-secondary">Create and manage execution queues.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="neu-button primary"
        >
          {showForm ? "Cancel" : "+ New Queue"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createQueue} className="neu-box mb-8 animate-fade-in-up">
          <h2 className="fw-bold text-primary mb-4" style={{ fontSize: "1.2rem" }}>Create Queue</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-secondary fw-semibold">Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="neu-input" />
            </div>
            <div className="flex flex-col gap-2 w-32">
              <label className="text-secondary fw-semibold">Priority</label>
              <input type="number" value={newPriority} onChange={e => setNewPriority(+e.target.value)} className="neu-input" />
            </div>
            <div className="flex flex-col gap-2 w-32">
              <label className="text-secondary fw-semibold">Concurrency</label>
              <input type="number" min={1} value={newConcurrency} onChange={e => setNewConcurrency(+e.target.value)} className="neu-input" />
            </div>
            <button type="submit" className="neu-button primary">
              Create
            </button>
          </div>
          {error && <p className="mt-3 text-sm" style={{ color: "var(--danger-color)" }}>{error}</p>}
        </form>
      )}

      <div className="neu-table-wrapper">
        <table className="neu-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Concurrency</th>
              <th>Status</th>
              <th>Stats (Q / R / D)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queues.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px" }} className="text-secondary">No queues found.</td></tr>
            )}
            {queues.map((q, idx) => (
              <tr key={q.id} className={`animate-fade-in-up animate-delay-${(idx % 3) + 1}`}>
                <td className="fw-bold text-primary">{q.name}</td>
                <td>
                  {editingId === q.id ? (
                    <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)} className="neu-input" style={{ width: "80px", padding: "4px 8px" }} />
                  ) : (
                    <span className="text-secondary fw-semibold">{q.priority}</span>
                  )}
                </td>
                <td>
                  {editingId === q.id ? (
                    <input type="number" min={1} value={editConcurrency} onChange={e => setEditConcurrency(+e.target.value)} className="neu-input" style={{ width: "80px", padding: "4px 8px" }} />
                  ) : (
                    <span className="text-secondary fw-semibold">
                      {q.stats.claimed + q.stats.running} / {q.concurrency_limit}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge ${q.paused ? "badge-secondary" : "badge-success"}`}>
                    {q.paused ? "PAUSED" : "ACTIVE"}
                  </span>
                </td>
                <td className="text-secondary fw-semibold" style={{ fontFamily: "monospace" }}>
                  {q.stats.queued} / {q.stats.claimed + q.stats.running} / {q.stats.completed}
                </td>
                <td>
                  <div className="flex gap-2">
                    {editingId === q.id ? (
                      <>
                        <button onClick={() => saveEdit(q.id)} className="neu-button" style={{ padding: "4px 12px", color: "var(--success-color)" }}>Save</button>
                        <button onClick={() => setEditingId(null)} className="neu-button" style={{ padding: "4px 12px" }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => togglePause(q)} className="neu-button" style={{ padding: "4px 12px" }}>
                          {q.paused ? "Resume" : "Pause"}
                        </button>
                        <button onClick={() => startEdit(q)} className="neu-button" style={{ padding: "4px 12px" }}>
                          Edit
                        </button>
                        {q.name !== "default" && (
                          <button onClick={() => deleteQueue(q)} className="neu-button" style={{ padding: "4px 12px", color: "var(--danger-color)" }}>
                            Delete
                          </button>
                        )}
                      </>
                    )}
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
