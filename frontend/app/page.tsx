"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { 
  Bell, 
  Search, 
  MoreVertical, 
  Briefcase, 
  Users, 
  CalendarClock, 
  FileCheck 
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Job {
  id: string;
  name: string;
  status: "QUEUED" | "CLAIMED" | "RUNNING" | "COMPLETED" | "FAILED";
  queue_name: string | null;
  created_at: string;
  attempt_count: number;
}

interface WorkerStatus {
  worker_id: string;
  status: "ONLINE" | "OFFLINE" | "IDLE";
}

interface QueueOption {
  id: string;
  priority: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  QUEUED: "text-slate-500",
  CLAIMED: "text-purple-600",
  RUNNING: "text-blue-600",
  COMPLETED: "text-emerald-600",
  FAILED: "text-red-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  "High": "bg-red-50 text-red-600 border border-red-100",
  "Medium": "bg-yellow-50 text-yellow-600 border border-yellow-100",
  "Low": "bg-emerald-50 text-emerald-600 border border-emerald-100",
};

function getPriorityLabel(priority: number) {
  if (priority > 10) return "High";
  if (priority >= 5) return "Medium";
  return "Low";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dashboard Metrics
  const queuedCount = jobs.filter(j => j.status === "QUEUED").length;
  const runningCount = jobs.filter(j => j.status === "RUNNING").length;
  const onlineWorkers = workers.filter(w => w.status !== "OFFLINE").length;
  const completedJobs = jobs.filter(j => j.status === "COMPLETED").length;

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, qRes, wRes] = await Promise.all([
        fetchApi(`/jobs/`),
        fetchApi(`/queues/`),
        fetchApi(`/workers/status`),
      ]);
      
      if (jobsRes.ok) { const d = await jobsRes.json(); setJobs(d.items || []); }
      else if (jobsRes.status === 401) { router.push("/login"); return; }
      else { setError("Failed to fetch jobs"); }

      if (qRes.ok) { const d = await qRes.json(); setQueues(d.items || []); }
      if (wRes.ok) { const d = await wRes.json(); setWorkers(d.items || []); }
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      setError("Network error fetching dashboard data");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) return <div className="p-8 text-slate-500">Loading dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Open Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your background jobs efficiently</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
            + New Job Posting
          </button>
          <button className="p-2.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <Bell className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Queued Jobs</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{queuedCount}</p>
            <p className="text-xs text-slate-400 mt-1">waiting to be claimed</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-xl">
            <Briefcase className="h-7 w-7 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Running Jobs</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{runningCount}</p>
            <p className="text-xs text-slate-400 mt-1">currently executing</p>
          </div>
          <div className="bg-emerald-50 p-3 rounded-xl">
            <Users className="h-7 w-7 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Queues</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{queues.length}</p>
            <p className="text-xs text-slate-400 mt-1">active routing queues</p>
          </div>
          <div className="bg-purple-50 p-3 rounded-xl">
            <CalendarClock className="h-7 w-7 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Online Workers</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{onlineWorkers}</p>
            <p className="text-xs text-slate-400 mt-1">processes polling</p>
          </div>
          <div className="bg-orange-50 p-3 rounded-xl">
            <FileCheck className="h-7 w-7 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              All Job Posting List
            </h2>
            <p className="text-sm text-emerald-500 font-medium mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              {completedJobs} done this month
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Here..." 
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 w-64"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs font-bold text-slate-900 uppercase bg-white border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 flex items-center gap-3">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Job Title
                </th>
                <th className="px-6 py-4">Queue</th>
                <th className="px-6 py-4">Attempts</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Posted On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => {
                const q = queues.find(q => q.name === job.queue_name);
                const priorityLabel = getPriorityLabel(q?.priority || 0);
                const progressPct = job.status === "COMPLETED" ? 100 : (job.status === "FAILED" ? 100 : (job.attempt_count > 0 ? 50 : 10));
                
                return (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                      <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      {job.name}
                    </td>
                    <td className="px-6 py-4">{job.queue_name || "default"}</td>
                    <td className="px-6 py-4">{job.attempt_count}</td>
                    <td className={`px-6 py-4 font-medium ${STATUS_STYLES[job.status] || "text-slate-500"}`}>
                      {job.status === "FAILED" ? "Failed" : (job.status === "COMPLETED" ? "Completed" : "No Hired")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 w-32">
                        <span className="text-xs font-semibold text-blue-600 w-8">{progressPct}%</span>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progressPct}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${PRIORITY_COLORS[priorityLabel]}`}>
                        {priorityLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                      {fmtDate(job.created_at)}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination mock */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <div>
            Showing <select className="bg-transparent font-medium text-slate-900 focus:outline-none"><option>20</option></select> Rows | 1-20 of {jobs.length} Entries
          </div>
          <div className="flex items-center gap-2">
            Page 
            <button className="w-7 h-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50">&lt;</button>
            <button className="w-7 h-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 font-medium text-slate-900">1</button>
            <button className="w-7 h-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50">&gt;</button>
            of 100
          </div>
        </div>
      </div>
    </div>
  );
}
