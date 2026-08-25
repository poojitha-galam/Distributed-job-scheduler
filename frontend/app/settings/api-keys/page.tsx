"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi, getProjectId, getAuthToken } from "@/lib/api";
import { useRouter } from "next/navigation";

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
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">API Keys</h1>
            <div className="mt-2 flex gap-4 text-sm font-medium">
              <Link href="/" className="text-gray-400 hover:text-gray-200 transition pb-1">Jobs</Link>
              <Link href="/settings/api-keys" className="text-blue-400 border-b border-blue-400 pb-1">API Keys</Link>
            </div>
          </div>
        </div>

        {newKey && (
          <div className="mb-8 rounded-xl border border-green-500/30 bg-green-900/20 p-5 backdrop-blur">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-400">Key Created Successfully</h2>
            <p className="mb-4 text-sm text-gray-300">Please copy this key now. You won't be able to see it again.</p>
            <div className="rounded bg-black p-3 font-mono text-green-300 break-all border border-green-500/20">
              {newKey}
            </div>
            <button onClick={() => setNewKey(null)} className="mt-4 text-sm text-green-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-8 rounded-xl border border-gray-800 bg-gray-900/60 p-5 backdrop-blur flex items-end gap-4">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">New Key Name</label>
            <input type="text" placeholder="e.g. Production Worker" value={name} onChange={e => setName(e.target.value)} required
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
            Generate Key
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Used</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-600">No API keys generated yet.</td></tr>
              )}
              {keys.map(k => (
                <tr key={k.id} className={`border-b border-gray-800/50 transition ${k.revoked ? 'opacity-50 bg-gray-900/40' : 'hover:bg-gray-800/40'}`}>
                  <td className="px-4 py-3 font-medium text-gray-200">
                    {k.name}
                    {k.revoked && <span className="ml-2 rounded bg-red-900/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-400 border border-red-500/20">Revoked</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{k.key_prefix}...</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(k.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                  <td className="px-4 py-3 text-right">
                    {!k.revoked ? (
                      <button onClick={() => handleRevoke(k.id)} className="text-red-400 hover:text-red-300 transition text-xs font-semibold">
                        Revoke
                      </button>
                    ) : (
                      <span className="text-gray-500 text-xs font-semibold cursor-not-allowed">Revoked</span>
                    )}
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
