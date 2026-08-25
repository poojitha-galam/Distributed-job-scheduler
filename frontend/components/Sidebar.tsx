"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Briefcase, 
  LayoutDashboard, 
  ListTree, 
  Calendar, 
  KeyRound, 
  Settings, 
  Search,
  LogOut,
  AlertOctagon
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Queues", href: "/queues", icon: ListTree },
    { name: "Schedules", href: "/schedules", icon: Calendar },
    { name: "DLQ", href: "/dlq", icon: AlertOctagon },
  ];

  const toolsItems = [
    { name: "API Keys", href: "/settings/api-keys", icon: KeyRound },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white h-screen flex flex-col hidden md:flex sticky top-0">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8 text-blue-600">
          <Briefcase className="h-6 w-6" />
          <span className="font-bold text-xl text-slate-900 tracking-tight">Hiring Flow</span>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search Here..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (pathname.startsWith('/jobs') && item.href === '/jobs' && pathname !== '/');
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-8 mb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Tools
        </div>
        <div className="space-y-1">
          {toolsItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
      
      <div className="mt-auto p-4 border-t border-slate-100">
         <button className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors">
            <LogOut className="h-4 w-4 text-slate-400" />
            Sign Out
         </button>
      </div>
    </div>
  );
}
