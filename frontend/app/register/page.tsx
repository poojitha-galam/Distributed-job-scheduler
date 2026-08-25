"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BASE_URL } from "@/lib/api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, organization_name: orgName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Registration failed");
      }

      const data = await res.json();
      localStorage.setItem("cws_token", data.access_token);

      // Fetch /me to get project_id
      const meRes = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.projects && meData.projects.length > 0) {
          localStorage.setItem("cws_project_id", meData.projects[0].id);
        }
      }

      router.push("/");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-color)"
    }}>
      <form onSubmit={handleSubmit} className="neu-box animate-fade-in-up" style={{ width: "100%", maxWidth: "450px", padding: "40px" }}>
        <h1 className="fw-bold text-primary mb-6" style={{ fontSize: "2rem", textAlign: "center" }}>Create Account</h1>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="fw-semibold text-secondary">Full Name</label>
            <input type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required className="neu-input" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="fw-semibold text-secondary">Email</label>
            <input type="email" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="neu-input" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="fw-semibold text-secondary">Password</label>
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="neu-input" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="fw-semibold text-secondary">Organization</label>
            <input type="text" placeholder="Acme Corp" value={orgName} onChange={e => setOrgName(e.target.value)} required className="neu-input" />
          </div>
          
          {error && <p className="text-danger text-sm fw-semibold text-center">{error}</p>}
          <button type="submit" className="neu-button primary mt-4" style={{ padding: "12px", width: "100%" }}>
            Register
          </button>
        </div>
        <p className="mt-8 text-center text-secondary">
          Already have an account? <Link href="/login" className="fw-bold text-primary hover:underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
