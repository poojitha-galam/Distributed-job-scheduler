"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

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
      const res = await fetchApi("/queues/", {
        method: "POST",
        body: JSON.stringify({ name: newName, priority: newPriority, concurrency_limit: newConcurrency })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `HTTP ${res.status}`);
      }
      setNewName(""); setNewPriority(0); setNewConcurrency(10); setShowForm(false);
      fetchQueues();
    } catch (err: any) {
      setError(err.message || "Failed to create queue");
    }
  }

  async function deleteQueue(q: QueueData) {
    if (!confirm(`Delete queue ${q.name}?`)) return;
    try {
      await fetchApi(`/queues/${q.id}`, { method: "DELETE" });
      fetchQueues();
    } catch (err) { alert("Failed to delete"); }
  }

  async function togglePause(q: QueueData) {
    const action = q.paused ? "resume" : "pause";
    try {
      await fetchApi(`/queues/${q.id}/${action}`, { method: "POST" });
      fetchQueues();
    } catch (err) { alert(`Failed to ${action}`); }
  }

  async function saveEdit(id: string) {
    await fetchApi(`/queues/${id}`, {
      method: "PUT",
      body: JSON.stringify({ priority: editPriority, concurrency_limit: editConcurrency })
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
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <TopNav />

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Queues</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            {showForm ? "Cancel" : "+ New Queue"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={createQueue} className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Create Queue</h2>
            <div className="flex flex-wrap items-end gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Priority</label>
                <input type="number" value={newPriority} onChange={e => setNewPriority(+e.target.value)}
                  className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Concurrency</label>
                <input type="number" min={1} value={newConcurrency} onChange={e => setNewConcurrency(+e.target.value)}
                  className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </div>
              <button type="submit" className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                Create
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-red-500 dark:text-red-400">{error}</p>}
          </form>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3">Concurrency</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Q / Run / Done</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queues.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">No queues yet.</td></tr>
                )}
                {queues.map(q => (
                  <tr key={q.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-200">{q.name}</td>
                    <td className="px-5 py-3.5">
                      {editingId === q.id ? (
                        <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)}
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">{q.priority}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {editingId === q.id ? (
                        <input type="number" min={1} value={editConcurrency} onChange={e => setEditConcurrency(+e.target.value)}
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">
                          {q.stats.claimed + q.stats.running}/{q.concurrency_limit}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                        q.paused
                          ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}>
                        {q.paused ? "PAUSED" : "ACTIVE"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {q.stats.queued} / {q.stats.claimed + q.stats.running} / {q.stats.completed}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        {editingId === q.id ? (
                          <>
                            <button onClick={() => saveEdit(q.id)}
                              className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => togglePause(q)}
                              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                              {q.paused ? "Resume" : "Pause"}
                            </button>
                            <button onClick={() => startEdit(q)}
                              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                              Edit
                            </button>
                            {q.name !== "default" && (
                              <button onClick={() => deleteQueue(q)}
                                className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50">
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
      </div>
    </main>
  );
}
