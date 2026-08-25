"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, getProjectId, getAuthToken } from "@/lib/api";
import { TopNav } from "@/components/TopNav";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export default function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!getAuthToken()) {
      router.push("/login");
      return;
    }
    loadKeys();
  }, [router]);

  async function loadKeys() {
    try {
      const pid = getProjectId();
      if (!pid) return;
      const res = await fetchApi(`/projects/${pid}/api-keys`);
      if (res.ok) {
        setKeys(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const pid = getProjectId();
      const res = await fetchApi(`/projects/${pid}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setName("");
        loadKeys();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this key?")) return;
    try {
      const pid = getProjectId();
      const res = await fetchApi(`/projects/${pid}/api-keys/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadKeys();
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <TopNav />

        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">API Keys</h2>
        </div>

        {newKey && (
          <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm dark:border-green-900/30 dark:bg-green-900/10">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-700 dark:text-green-500">Key Created Successfully</h2>
            <p className="mb-4 text-sm text-green-600 dark:text-green-400">Please copy this key now. You won't be able to see it again.</p>
            <div className="rounded-md border border-green-200 bg-white p-4 font-mono text-slate-900 break-all shadow-sm dark:border-green-800 dark:bg-slate-950 dark:text-slate-100">
              {newKey}
            </div>
            <button onClick={() => setNewKey(null)} className="mt-4 text-sm font-medium text-green-700 hover:underline dark:text-green-400">
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-8 flex items-end gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">New Key Name</label>
            <input type="text" placeholder="e.g. Production Worker" value={name} onChange={e => setName(e.target.value)} required
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500" />
          </div>
          <button type="submit" className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
            Generate Key
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Prefix</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Last Used</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">No API keys generated yet.</td></tr>
                )}
                {keys.map(k => (
                  <tr key={k.id} className={`border-b border-slate-100 transition-colors dark:border-slate-800/50 ${k.revoked ? 'bg-slate-50/50 opacity-60 dark:bg-slate-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-200">
                      {k.name}
                      {k.revoked && <span className="ml-3 inline-flex items-center rounded-sm border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase text-red-600 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400">Revoked</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{k.key_prefix}...</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{new Date(k.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                    <td className="px-5 py-3.5 text-right">
                      {!k.revoked ? (
                        <button onClick={() => handleRevoke(k.id)} className="text-xs font-semibold text-red-600 hover:text-red-500 transition dark:text-red-400 dark:hover:text-red-300">
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400 cursor-not-allowed">Revoked</span>
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
