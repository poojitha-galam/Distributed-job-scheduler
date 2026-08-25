"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";

export function TopNav() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header style={{
      height: "80px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 32px",
      background: "var(--surface-color)",
      borderBottom: "1px solid var(--border-color)",
      position: "sticky",
      top: 0,
      zIndex: 5
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "400px" }}>
        <input 
          type="text" 
          placeholder="🔍 Search Here..." 
          className="neu-input" 
          style={{ padding: "8px 16px", borderRadius: "20px" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        
        {/* Theme Toggle */}
        <div className="theme-switch-wrapper">
          <span>☀️</span>
          <label className="theme-switch" htmlFor="checkbox">
            <input 
              type="checkbox" 
              id="checkbox" 
              checked={theme === "dark"} 
              onChange={toggleTheme} 
            />
            <div className="slider round"></div>
          </label>
          <span>🌙</span>
        </div>

        {/* Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div className="fw-bold" style={{ fontSize: "0.95rem" }}>Admin User</div>
            <div className="text-muted" style={{ fontSize: "0.8rem" }}>test_user_id@example.com</div>
          </div>
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%",
            background: "var(--bg-color)",
            boxShadow: "var(--neu-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", color: "var(--primary-color)"
          }}>
            AU
          </div>
        </div>

      </div>
    </header>
  );
}
