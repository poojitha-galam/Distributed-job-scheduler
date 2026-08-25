"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { usePathname } from "next/navigation";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Don't apply dashboard layout to login/register pages
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: "260px", display: "flex", flexDirection: "column" }}>
        <TopNav />
        <main style={{ padding: "32px", flex: 1 }} className="animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  );
}
