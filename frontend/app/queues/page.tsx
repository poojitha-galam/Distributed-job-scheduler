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
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Queues</h2>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-xl glow-blue"
          >
            {showForm ? "Cancel" : "+ New Queue"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={createQueue} className="mb-8 rounded-2xl glass-card p-7">
            <h2 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Create Queue</h2>
            <div className="flex flex-wrap items-end gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required
                  className="rounded-xl border border-slate-300/80 bg-white/50 px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-900" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Priority</label>
                <input type="number" value={newPriority} onChange={e => setNewPriority(+e.target.value)}
                  className="w-24 rounded-xl border border-slate-300/80 bg-white/50 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Concurrency</label>
                <input type="number" min={1} value={newConcurrency} onChange={e => setNewConcurrency(+e.target.value)}
                  className="w-32 rounded-xl border border-slate-300/80 bg-white/50 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:bg-slate-900" />
              </div>
              <button type="submit" className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-xl glow-blue">
                Create Queue
              </button>
            </div>
            {error && <p className="mt-5 text-sm font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/30">{error}</p>}
          </form>
        )}

        <div className="rounded-2xl glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200/60 p-6 dark:border-slate-800/60">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Active Queues</h2>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">{queues.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/50 text-xs font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/30 dark:text-slate-400">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Concurrency</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Q / Run / Done</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queues.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">No queues configured.</td></tr>
                )}
                {queues.map(q => (
                  <tr key={q.id} className="border-b border-slate-100/50 transition-colors hover:bg-slate-50/50 dark:border-slate-800/30 dark:hover:bg-slate-800/30 group">
                    <td className="px-6 py-4 font-semibold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400">{q.name}</td>
                    
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {editingId === q.id ? (
                        <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)}
                          className="w-20 rounded-md border border-slate-300/80 bg-white/50 px-2 py-1 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100" />
                      ) : (
                        <span className="font-mono">{q.priority}</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {editingId === q.id ? (
                        <input type="number" min={1} value={editConcurrency} onChange={e => setEditConcurrency(+e.target.value)}
                          className="w-20 rounded-md border border-slate-300/80 bg-white/50 px-2 py-1 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100" />
                      ) : (
                        <span className="font-mono">{q.stats.claimed + q.stats.running}/{q.concurrency_limit}</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {q.paused ? (
                        <span className="flex w-max items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Paused
                        </span>
                      ) : (
                        <span className="flex w-max items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> Active
                        </span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {q.stats.queued} / {q.stats.claimed + q.stats.running} / {q.stats.completed}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {editingId === q.id ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(q.id)} className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-800/60 transition">Save</button>
                          <button onClick={() => setEditingId(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 transition">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button onClick={() => togglePause(q)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700 transition">
                            {q.paused ? "Resume" : "Pause"}
                          </button>
                          <button onClick={() => startEdit(q)} className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60 transition">
                            Edit
                          </button>
                          {q.name !== "default" && (
                            <button onClick={() => deleteQueue(q)} className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/60 transition">
                              Delete
                            </button>
                          )}
                        </div>
                      )}
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
