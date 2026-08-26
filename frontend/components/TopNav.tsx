"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { fetchApi } from "@/lib/api";

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { name: "Jobs", path: "/" },
    { name: "Schedules", path: "/schedules" },
    { name: "Queues", path: "/queues" },
    { name: "API Keys", path: "/settings/api-keys" },
  ];

  const handleLogout = async () => {
    try {
      await fetchApi("/auth/logout", { method: "POST" });
    } catch (e) {
      console.error(e);
    } finally {
      localStorage.removeItem("cws_project_id");
      window.location.href = "/login";
    }
  };

  return (
    <div className="mb-8 glass rounded-2xl px-4 py-4 sm:px-6 sm:py-5 shadow-sm relative z-50">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg glow-blue shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
            </span>
            <span className="truncate">Job Scheduler</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium ml-9 sm:ml-10 hidden sm:block">
            Distributed background job processing
          </p>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Desktop Nav Actions */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-4 text-xs font-semibold text-red-600 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:shadow dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              aria-label="Logout"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Logout
            </button>
            
            <button
              onClick={toggleTheme}
              className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white/50 px-4 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  Light
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Dark
                </>
              )}
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/50 text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            )}
          </button>
        </div>
      </div>

      {/* Desktop Navigation */}
      <nav className="mt-6 hidden sm:flex items-center gap-6 ml-10">
        {navLinks.map((link) => {
          const isActive = pathname === link.path;
          return (
            <Link
              key={link.path}
              href={link.path}
              className={`text-sm font-semibold transition-all relative py-1 ${
                isActive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {link.name}
              {isActive && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-blue-600 dark:bg-blue-400 glow-blue"></span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Mobile Navigation Dropdown */}
      {menuOpen && (
        <div className="mt-4 flex flex-col gap-2 sm:hidden border-t border-slate-200 dark:border-slate-700/50 pt-4">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                onClick={() => setMenuOpen(false)}
                className={`text-sm font-semibold px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
          
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/50">
             <button
              onClick={toggleTheme}
              className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/50 px-4 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200"
            >
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-4 text-xs font-semibold text-red-600 shadow-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
