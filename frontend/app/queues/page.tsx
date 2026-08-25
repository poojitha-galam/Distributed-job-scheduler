"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getAuthToken } from "@/lib/api";
import { Search, MoreVertical, ListTree } from "lucide-react";

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
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routing Queues</h1>
          <p className="text-sm text-slate-500 mt-1">Manage concurrency and priority for job queues</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          + New Queue
        </button>
      </div>

      {showForm && (
        <form onSubmit={createQueue} className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800 flex items-center gap-2">
            <ListTree className="h-4 w-4 text-blue-600" />
            Create Queue
          </h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <label className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5 w-32">
              <label className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Priority</label>
              <input type="number" value={newPriority} onChange={e => setNewPriority(+e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5 w-32">
              <label className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Concurrency</label>
              <input type="number" min={1} value={newConcurrency} onChange={e => setNewConcurrency(+e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            <button type="submit" className="rounded-lg bg-emerald-600 px-6 py-2 h-10 text-sm font-semibold text-white hover:bg-emerald-500 transition">
              Create
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </form>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Active Queues</h2>
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
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Concurrency</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Q / Run / Done</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queues.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No queues found
                  </td>
                </tr>
              )}
              {queues.map(q => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{q.name}</td>
                  <td className="px-6 py-4">
                    {editingId === q.id ? (
                      <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900" />
                    ) : (
                      <span className="font-semibold">{q.priority}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === q.id ? (
                      <input type="number" min={1} value={editConcurrency} onChange={e => setEditConcurrency(+e.target.value)}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900" />
                    ) : (
                      <span>
                        <span className="font-semibold text-slate-900">{q.stats.claimed + q.stats.running}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-500">{q.concurrency_limit}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide ${
                      q.paused
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {q.paused ? "PAUSED" : "ACTIVE"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs font-medium space-x-1.5">
                    <span className="text-slate-400">{q.stats.queued}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-blue-600">{q.stats.claimed + q.stats.running}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-emerald-600">{q.stats.completed}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {editingId === q.id ? (
                        <>
                          <button onClick={() => saveEdit(q.id)}
                            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="rounded bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-300 transition">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => togglePause(q)}
                            className="rounded bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition border border-slate-200">
                            {q.paused ? "Resume" : "Pause"}
                          </button>
                          <button onClick={() => startEdit(q)}
                            className="rounded bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 transition border border-blue-100">
                            Edit
                          </button>
                          {q.name !== "default" && (
                            <button onClick={() => deleteQueue(q)}
                              className="rounded bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition border border-red-100">
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
  );
}
