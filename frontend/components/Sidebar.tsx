"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Dashboard", path: "/", icon: "🏠" },
    { name: "Jobs", path: "/jobs", icon: "💼" },
    { name: "Queues", path: "/queues", icon: "🗂️" },
    { name: "Schedules", path: "/schedules", icon: "⏱️" },
    { name: "DLQ", path: "/dlq", icon: "🚨" },
    { name: "API Keys", path: "/settings", icon: "🔑" },
  ];

  return (
    <aside style={{
      width: "260px",
      height: "100vh",
      position: "fixed",
      left: 0,
      top: 0,
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
      borderRight: "1px solid var(--border-color)",
      background: "var(--surface-color)",
      zIndex: 10
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "1.25rem", fontWeight: "bold" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "12px",
          background: "var(--primary-color)", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--neu-sm)"
        }}>
          ✨
        </div>
        Hiring Flow
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {links.map((link) => {
          const isActive = pathname === link.path || (link.path !== "/" && pathname.startsWith(link.path));
          return (
            <Link key={link.path} href={link.path}>
              <div style={{
                padding: "12px 16px",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: isActive ? "var(--primary-color)" : "var(--text-secondary)",
                fontWeight: isActive ? 600 : 500,
                boxShadow: isActive ? "var(--neu-pressed)" : "none",
                background: isActive ? "var(--bg-color)" : "transparent",
                transition: "all 0.2s ease"
              }}>
                <span style={{ fontSize: "1.2rem" }}>{link.icon}</span>
                {link.name}
              </div>
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto" }}>
        <div className="neu-card" style={{ fontSize: "0.9rem", textAlign: "center" }}>
          <div className="text-secondary" style={{ marginBottom: "8px" }}>Current Project</div>
          <div className="fw-bold">Default Project</div>
        </div>
      </div>
    </aside>
  );
}
