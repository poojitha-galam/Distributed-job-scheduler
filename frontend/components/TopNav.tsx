"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const navLinks = [
    { name: "Jobs", path: "/" },
    { name: "Schedules", path: "/schedules" },
    { name: "Queues", path: "/queues" },
    { name: "API Keys", path: "/settings/api-keys" },
  ];

  return (
    <div className="mb-8 border-b border-slate-200 dark:border-slate-800 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Job Scheduler
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Distributed background job processing
          </p>
        </div>
        <button
          onClick={toggleTheme}
          className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <>
              <span>☀</span> Light
            </>
          ) : (
            <>
              <span>☾</span> Dark
            </>
          )}
        </button>
      </div>

      <nav className="mt-6 flex items-center gap-6">
        {navLinks.map((link) => {
          const isActive = pathname === link.path;
          return (
            <Link
              key={link.path}
              href={link.path}
              className={`text-sm font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 pb-2"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 pb-2"
              }`}
            >
              {link.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
