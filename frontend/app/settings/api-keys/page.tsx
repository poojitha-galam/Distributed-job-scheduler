"use client";

import { useEffect, useState } from "react";
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
    <div style={{ paddingBottom: "40px" }} className="animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="fw-bold" style={{ fontSize: "1.8rem" }}>API Keys</h1>
          <p className="text-secondary">Manage your project's authentication keys.</p>
        </div>
      </div>

      {newKey && (
        <div className="neu-box mb-8" style={{ border: "1px solid var(--success-color)", background: "rgba(16, 185, 129, 0.05)" }}>
          <h2 className="fw-bold mb-2" style={{ color: "var(--success-color)" }}>Key Created Successfully</h2>
          <p className="text-secondary mb-4">Please copy this key now. You won't be able to see it again.</p>
          <div className="neu-input" style={{ fontFamily: "monospace", color: "var(--success-color)", wordBreak: "break-all" }}>
            {newKey}
          </div>
          <button onClick={() => setNewKey(null)} className="neu-button mt-4" style={{ padding: "4px 12px" }}>
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="neu-box flex items-end gap-4 mb-8">
        <div className="flex-1 flex flex-col gap-2">
          <label className="fw-semibold text-secondary">New Key Name</label>
          <input type="text" placeholder="e.g. Production Worker" value={name} onChange={e => setName(e.target.value)} required className="neu-input" />
        </div>
        <button type="submit" className="neu-button primary">
          Generate Key
        </button>
      </form>

      <div className="neu-table-wrapper">
        <table className="neu-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px" }} className="text-secondary">No API keys generated yet.</td></tr>
            )}
            {keys.map(k => (
              <tr key={k.id} style={{ opacity: k.revoked ? 0.5 : 1 }}>
                <td className="fw-bold text-primary">
                  {k.name}
                  {k.revoked && <span className="badge badge-danger ml-2">Revoked</span>}
                </td>
                <td className="font-mono text-secondary">{k.key_prefix}...</td>
                <td className="text-secondary">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="text-secondary">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                <td>
                  {!k.revoked ? (
                    <button onClick={() => handleRevoke(k.id)} className="neu-button" style={{ color: "var(--danger-color)", padding: "4px 12px" }}>
                      Revoke
                    </button>
                  ) : (
                    <span className="text-muted fw-semibold">Revoked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
