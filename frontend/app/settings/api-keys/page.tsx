"use client";

import { useEffect, useState } from "react";
import { fetchApi, getProjectId, getAuthToken } from "@/lib/api";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

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
  }, []);

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
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
          <p className="text-sm text-slate-500 mt-1">Manage programmatic access to your projects</p>
        </div>
      </div>

      {newKey && (
        <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-emerald-800">Key Created Successfully</h2>
          <p className="mb-4 text-sm text-emerald-700">Please copy this key now. You won't be able to see it again.</p>
          <div className="rounded-lg bg-white p-4 font-mono text-emerald-700 break-all border border-emerald-200 shadow-inner">
            {newKey}
          </div>
          <button onClick={() => setNewKey(null)} className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-end gap-4">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-blue-600" />
            New Key Name
          </label>
          <input type="text" placeholder="e.g. Production Worker" value={name} onChange={e => setName(e.target.value)} required
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:bg-white" />
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm h-[42px]">
          Generate Key
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs font-bold text-slate-900 uppercase bg-white border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Prefix</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Last Used</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No API keys generated yet.</td></tr>
              )}
              {keys.map(k => (
                <tr key={k.id} className={`transition-colors ${k.revoked ? 'opacity-50 bg-slate-50/50' : 'hover:bg-slate-50'}`}>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {k.name}
                    {k.revoked && <span className="ml-2 inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-red-100 text-red-700">Revoked</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{k.key_prefix}...</td>
                  <td className="px-6 py-4 text-slate-500">{new Date(k.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-slate-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                  <td className="px-6 py-4 text-right">
                    {!k.revoked ? (
                      <button onClick={() => handleRevoke(k.id)} className="text-red-600 hover:text-red-700 transition text-xs font-bold uppercase tracking-wide">
                        Revoke
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wide cursor-not-allowed">Revoked</span>
                    )}
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
