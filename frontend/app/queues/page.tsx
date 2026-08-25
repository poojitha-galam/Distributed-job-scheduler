"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

// const API = "http://localhost:8000/api/v1";

function fmtDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString();
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
      if (res.ok) setQueues(await res.json());
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
  }, [fetchQueues]);

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
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Job Scheduler</h1>
            <div className="mt-2 flex gap-4 text-sm font-medium">
              <Link href="/" className="text-gray-400 hover:text-gray-200 transition pb-1">Jobs</Link>
              <Link href="/schedules" className="text-gray-400 hover:text-gray-200 transition pb-1">Schedules</Link>
              <Link href="/queues" className="text-blue-400 border-b border-blue-400 pb-1">Queues</Link>
              <Link href="/settings/api-keys" className="text-gray-400 hover:text-gray-200 transition pb-1">API Keys</Link>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
          >
            + New Queue
          </button>
        </div>

        {showForm && (
          <form onSubmit={createQueue} className="mb-8 rounded-xl border border-gray-800 bg-gray-900/60 p-5 backdrop-blur">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">Create Queue</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Priority</label>
                <input type="number" value={newPriority} onChange={e => setNewPriority(+e.target.value)}
                  className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Concurrency</label>
                <input type="number" min={1} value={newConcurrency} onChange={e => setNewConcurrency(+e.target.value)}
                  className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500" />
              </div>
              <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition">
                Create
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </form>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Concurrency</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Q / Running / Done</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queues.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-600">No queues yet.</td></tr>
              )}
              {queues.map(q => (
                <tr key={q.id} className="border-b border-gray-800/50 transition hover:bg-gray-800/40">
                  <td className="px-5 py-3 font-medium text-gray-200">{q.name}</td>
                  <td className="px-5 py-3">
                    {editingId === q.id ? (
                      <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)}
                        className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100" />
                    ) : (
                      <span className="text-gray-300">{q.priority}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editingId === q.id ? (
                      <input type="number" min={1} value={editConcurrency} onChange={e => setEditConcurrency(+e.target.value)}
                        className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100" />
                    ) : (
                      <span className="text-gray-300">
                        {q.stats.claimed + q.stats.running}/{q.concurrency_limit}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
                      q.paused
                        ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}>
                      {q.paused ? "PAUSED" : "ACTIVE"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">
                    {q.stats.queued} / {q.stats.claimed + q.stats.running} / {q.stats.completed}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      {editingId === q.id ? (
                        <>
                          <button onClick={() => saveEdit(q.id)}
                            className="rounded bg-emerald-800 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-700 transition">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-700 transition">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => togglePause(q)}
                            className="rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition">
                            {q.paused ? "Resume" : "Pause"}
                          </button>
                          <button onClick={() => startEdit(q)}
                            className="rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition">
                            Edit
                          </button>
                          {q.name !== "default" && (
                            <button onClick={() => deleteQueue(q)}
                              className="rounded bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-800 hover:text-white transition">
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
    </main>
  );
}
