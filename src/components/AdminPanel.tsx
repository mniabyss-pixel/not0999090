import React, { useState, useEffect } from "react";
import { 
  Trash2, 
  Download, 
  Search, 
  ArrowLeft, 
  CheckCircle, 
  ShieldCheck, 
  RotateCw, 
  AlertCircle,
  Clock,
  UserCheck
} from "lucide-react";
import { db, OperationType, handleFirestoreError } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  deleteDoc, 
  updateDoc 
} from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface Subscriber {
  id: string;
  email: string;
  createdAt: any; // Firestore Timestamp
  status: "active" | "unsubscribed";
}

interface AdminPanelProps {
  onBack: () => void;
  adminEmail: string;
}

export default function AdminPanel({ onBack, adminEmail }: AdminPanelProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [selectedSubscriberForDelete, setSelectedSubscriberForDelete] = useState<Subscriber | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<"15days" | "all">("15days");

  // Helper method: Aggregate subscriptions over the last 15 days with fallback zeroes for inactive days
  const getChartData = (): Array<{ date: string; count: number }> => {
    const dailyCounts: { [key: string]: number } = {};

    subscribers.forEach((sub) => {
      if (!sub.createdAt) return;
      try {
        const dateObj = sub.createdAt.toDate ? sub.createdAt.toDate() : new Date();
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const key = `${year}-${month}-${day}`;
        
        dailyCounts[key] = (dailyCounts[key] || 0) + 1;
      } catch (e) {
        console.warn("Error parsing subscriber date for chart", e);
      }
    });

    const result: Array<{ date: string; count: number }> = [];
    const today = new Date();
    
    // Process the last 15 calendar days
    for (let i = 14; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;
      
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({
        date: label,
        count: dailyCounts[key] || 0
      });
    }

    return result;
  };

  // Helper method: Aggregate subscription occurrences across all times chronologically
  const getAllTimeChartData = (): Array<{ date: string; count: number }> => {
    const dailyCounts: { [key: string]: number } = {};

    subscribers.forEach((sub) => {
      if (!sub.createdAt) return;
      try {
        const dateObj = sub.createdAt.toDate ? sub.createdAt.toDate() : new Date();
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const key = `${year}-${month}-${day}`;
        
        dailyCounts[key] = (dailyCounts[key] || 0) + 1;
      } catch (e) {
        // ignore date parse issues
      }
    });

    const sortedKeys = Object.keys(dailyCounts).sort();
    
    if (sortedKeys.length === 0) {
      return [];
    }

    return sortedKeys.map((key) => {
      const [year, month, day] = key.split("-");
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const label = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        date: label,
        count: dailyCounts[key]
      };
    });
  };

  // Load subscriptions in real time
  useEffect(() => {
    setLoading(true);
    setError(null);
    const collectionPath = "subscriptions";
    
    try {
      const q = query(collection(db, collectionPath), orderBy("createdAt", "desc"));
      
      const unsubscribe = onSnapshot(
        q, 
        (snapshot) => {
          const list: Subscriber[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            list.push({
              id: doc.id,
              email: data.email || "",
              createdAt: data.createdAt,
              status: data.status || "active",
            });
          });
          setSubscribers(list);
          setLoading(false);
        }, 
        (err) => {
          setError("Failed to fetch subscriptions. Insufficient permissions.");
          setLoading(false);
          try {
            handleFirestoreError(err, OperationType.GET, collectionPath);
          } catch (loggedErr) {
            console.error("Firestore error logged internally");
          }
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during database subscription setup.");
      setLoading(false);
    }
  }, []);

  // Filter subscribers based on search query and status filter
  const filteredSubscribers = subscribers.filter((sub) => {
    const matchesSearch = sub.email.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Export subscribers to CSV file
  const handleExportCSV = () => {
    if (filteredSubscribers.length === 0) return;
    
    // Header
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Email,Subscribed Date,Status\n";
    
    // Rows
    filteredSubscribers.forEach((sub) => {
      const date = sub.createdAt?.toDate ? sub.createdAt.toDate().toISOString() : "Unknown";
      csvContent += `${sub.id},${sub.email},${date},${sub.status}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `curvalab_subscribers_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Toggle dynamic subscriber status between active/unsubscribed
  const handleToggleStatus = async (sub: Subscriber) => {
    const newStatus = sub.status === "active" ? "unsubscribed" : "active";
    setError(null);
    try {
      const docRef = doc(db, "subscriptions", sub.id);
      await updateDoc(docRef, { status: newStatus });
      triggerToast(`Successfully set status of ${sub.email} to ${newStatus}`);
    } catch (err) {
      setError("Failed to update status. Please make sure your IP has sufficient permission keys.");
      try {
        handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${sub.id}`);
      } catch (logErr) {}
    }
  };

  // Delete subscriber
  const handleDeleteSubscriber = async () => {
    if (!selectedSubscriberForDelete) return;
    setIsDeleting(true);
    setError(null);
    
    try {
      const subId = selectedSubscriberForDelete.id;
      const subEmail = selectedSubscriberForDelete.email;
      
      const docRef = doc(db, "subscriptions", subId);
      await deleteDoc(docRef);
      
      triggerToast(`Removed subscriber: ${subEmail}`);
      setSelectedSubscriberForDelete(null);
    } catch (err) {
      setError("Failed to delete subscription. Unauthorized action.");
      try {
        handleFirestoreError(err, OperationType.DELETE, `subscriptions/${selectedSubscriberForDelete.id}`);
      } catch (logErr) {}
    } finally {
      setIsDeleting(false);
    }
  };

  const triggerToast = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 4000);
  };

  // Stat calculations
  const totalCount = subscribers.length;
  const activeCount = subscribers.filter((s) => s.status === "active").length;
  const unsubscribedCount = subscribers.filter((s) => s.status === "unsubscribed").length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-16" id="admin-portal-wrapper">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {actionSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 text-black px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-2.5 border border-white/20 backdrop-blur-md text-xs font-medium tracking-wide font-sans cursor-pointer"
            onClick={() => setActionSuccessMessage(null)}
            id="admin-toast"
          >
            <CheckCircle className="w-4.5 h-4.5 text-black" />
            <span>{actionSuccessMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="admin-header-row">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-xs font-mono tracking-wider uppercase mb-2 group cursor-pointer"
            id="admin-back-btn"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Site
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-light text-white tracking-tight leading-none font-apple-garamond">
              Curation <span className="italic font-light text-white/95">Dashboard</span>
            </h2>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Mode
            </div>
          </div>
          <p className="text-white/40 text-[11px] font-mono leading-relaxed">
            Authenticated Curative Desk for administrator <span className="text-white/70 select-text">{adminEmail}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto" id="admin-actions-controls">
          <button
            onClick={handleExportCSV}
            disabled={filteredSubscribers.length === 0}
            className="liquid-glass rounded-full px-5 py-2.5 text-white text-xs font-medium tracking-wide hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed select-none w-full md:w-auto"
            id="admin-export-btn"
          >
            <Download className="w-4 h-4 text-white" />
            Export Filtered CSV
          </button>
        </div>
      </div>

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="admin-stats-bento">
        <div className="liquid-glass rounded-[1.5rem] p-6 flex flex-col justify-between space-y-4" id="stat-card-total">
          <div className="flex items-center justify-between opacity-50">
            <span className="text-[10px] font-mono uppercase tracking-widest">Total Curated List</span>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-4xl font-light text-white tracking-tight font-mono">{totalCount}</div>
            <p className="text-[11px] text-white/40 mt-1">Sum of all subscribed addresses.</p>
          </div>
        </div>

        <div className="liquid-glass rounded-[1.5rem] p-6 flex flex-col justify-between space-y-4" id="stat-card-active">
          <div className="flex items-center justify-between opacity-50">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#a7f3d0]">Active Readers</span>
            <UserCheck className="w-4 h-4 text-[#a7f3d0]" />
          </div>
          <div>
            <div className="text-4xl font-light text-emerald-400 tracking-tight font-mono">{activeCount}</div>
            <p className="text-[11px] text-white/40 mt-1">Actively receiving emails.</p>
          </div>
        </div>

        <div className="liquid-glass rounded-[1.5rem] p-6 flex flex-col justify-between space-y-4" id="stat-card-unsubscribed">
          <div className="flex items-center justify-between opacity-50">
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Unsubscribers</span>
            <AlertCircle className="w-4 h-4 text-white/30" />
          </div>
          <div>
            <div className="text-4xl font-light text-white/50 tracking-tight font-mono">{unsubscribedCount}</div>
            <p className="text-[11px] text-white/40 mt-1">Opted out of current issues.</p>
          </div>
        </div>
      </div>

      {/* Visual Analytics Section */}
      <div className="liquid-glass rounded-[2rem] p-6 md:p-8 space-y-6" id="admin-analytics-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="analytics-header">
          <div className="space-y-1">
            <h3 className="text-xl font-light text-white tracking-tight font-apple-garamond">
              Subscriber <span className="italic font-light text-white/95">Growth Velocity</span>
            </h3>
            <p className="text-white/40 text-[11px] font-mono">
              Plotting the volume of new subscriber registrations per day
            </p>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center bg-white/5 p-1 rounded-full border border-white/10 self-start sm:self-center" id="analytics-timeframe-selector">
            {(["15days", "all"] as const).map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setChartTimeframe(timeframe)}
                className={`rounded-full px-4 py-1.5 text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer ${
                  chartTimeframe === timeframe 
                    ? "bg-white text-black font-semibold" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
                id={`timeframe-btn-${timeframe}`}
              >
                {timeframe === "15days" ? "Past 15 Days" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Container */}
        <div className="h-72 w-full pt-4 font-mono text-[10px]" id="subscriber-recharts-container">
          {subscribers.length === 0 ? (
            <div className="h-full flex items-center justify-center border border-dashed border-white/10 rounded-2xl" id="analytics-empty-state">
              <span className="text-xs text-white/40 font-mono tracking-wider uppercase">No registration statistics populated</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={chartTimeframe === "15days" ? getChartData() : getAllTimeChartData()} 
                margin={{ top: 10, right: 15, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <YAxis 
                  allowDecimals={false}
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <Tooltip 
                  contentStyle={{
                    background: "rgba(10, 10, 10, 0.9)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "1rem",
                    color: "#ffffff",
                    textAlign: "left"
                  }}
                  itemStyle={{
                    color: "#34d399",
                    fontSize: "12px",
                    fontFamily: "sans-serif"
                  }}
                  labelStyle={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "10px",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "4px"
                  }}
                  cursor={{ stroke: "rgba(255, 255, 255, 0.15)", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  name="New Signups"
                  stroke="#34d399" 
                  strokeWidth={2}
                  activeDot={{ r: 6, stroke: "#34d399", strokeWidth: 2, fill: "#000000" }}
                  dot={{ r: 3, stroke: "#10b981", strokeWidth: 1.5, fill: "#000000" }}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main Database Table Area */}
      <div className="liquid-glass rounded-[2rem] p-6 md:p-8 space-y-6" id="admin-subscriber-database">
        
        {/* Filters and Search toolbar */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between" id="admin-toolbar">
          {/* Search Box */}
          <div className="liquid-glass rounded-full px-5 py-2.5 flex items-center gap-3 w-full md:max-w-md">
            <Search className="w-4.5 h-4.5 text-white/40 shrink-0" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subscribers by email..."
              className="bg-transparent text-white placeholder:text-white/30 text-xs md:text-sm outline-none flex-1 border-none focus:ring-0"
              id="admin-search-input"
            />
          </div>

          {/* Status Segmented Filter */}
          <div className="flex items-center bg-white/5 p-1 rounded-full border border-white/10 w-full md:w-auto" id="admin-status-filters">
            {(["all", "active", "unsubscribed"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`flex-1 md:flex-none rounded-full px-4 py-1.5 text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer ${
                  statusFilter === mode 
                    ? "bg-white text-black font-semibold" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
                id={`filter-btn-${mode}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-500/20 rounded-xl p-4 flex gap-3 text-red-400 text-xs items-center" id="admin-error-box">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="flex-1 leading-relaxed font-mono">{error}</p>
          </div>
        )}

        {/* List of subscriptions */}
        <div className="overflow-x-auto w-full" id="admin-table-scroll-container">
          {loading ? (
            <div className="py-24 text-center space-y-3" id="admin-loading-indicator">
              <RotateCw className="w-6 h-6 text-white/40 animate-spin mx-auto" />
              <p className="text-xs font-mono text-white/30 tracking-widest uppercase">Fetching Vault Indexes</p>
            </div>
          ) : filteredSubscribers.length === 0 ? (
            <div className="py-24 text-center space-y-2 border border-dashed border-white/10 rounded-2xl" id="admin-empty-state">
              <p className="text-sm font-light text-white/50">No subscribers found</p>
              <p className="text-xs text-white/30 max-w-xs mx-auto">
                No subscription documents matched your search filter "{statusFilter === "all" ? "" : statusFilter}" parameters.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse select-text" id="subscriber-list-table">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-4 text-[10px] font-mono tracking-widest uppercase text-white/50 pl-2">Recipient / Subscriber</th>
                  <th className="pb-4 text-[10px] font-mono tracking-widest uppercase text-white/50">Subscribed At (Local)</th>
                  <th className="pb-4 text-[10px] font-mono tracking-widest uppercase text-white/50 text-center">Receipt Status</th>
                  <th className="pb-4 text-[10px] font-mono tracking-widest uppercase text-white/50 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscribers.map((sub) => {
                  const localDateString = sub.createdAt?.toDate 
                    ? sub.createdAt.toDate().toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Pending sync...";

                  return (
                    <tr 
                      key={sub.id} 
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      id={`subscriber-row-${sub.id}`}
                    >
                      {/* Recipient Email */}
                      <td className="py-4 pl-2">
                        <span className="text-xs font-medium text-white block select-all font-mono">
                          {sub.email}
                        </span>
                        <span className="text-[9px] font-mono text-white/30 select-all block mt-0.5">
                          ID: {sub.id}
                        </span>
                      </td>

                      {/* Created date */}
                      <td className="py-4">
                        <span className="text-xs text-white/70 font-mono">
                          {localDateString}
                        </span>
                      </td>

                      {/* Status checkbox toggle */}
                      <td className="py-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(sub)}
                          className={`mx-auto px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest transition-all cursor-pointer select-none border ${
                            sub.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                          }`}
                          id={`status-toggle-${sub.id}`}
                          title={`Toggle status to ${sub.status === "active" ? "unsubscribed" : "active"}`}
                        >
                          {sub.status}
                        </button>
                      </td>

                      {/* Deletion purge trigger */}
                      <td className="py-4 pr-2 text-right">
                        <button
                          onClick={() => setSelectedSubscriberForDelete(sub)}
                          className="p-2 text-white/40 hover:text-red-400 rounded-full hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                          aria-label="Delete subscriber"
                          id={`delete-btn-${sub.id}`}
                          title="Purge Subscriber Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {selectedSubscriberForDelete && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md"
            onClick={() => setSelectedSubscriberForDelete(null)}
            id="admin-delete-modal-backdrop"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="liquid-glass w-full max-w-sm rounded-[2rem] p-8 space-y-6 text-center border border-red-500/10"
              onClick={(e) => e.stopPropagation()}
              id="admin-delete-modal"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 bg-red-950/40 border border-red-500/30 text-red-400 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-5 h-5 animate-pulse" />
                </div>
                <h3 className="text-lg font-normal tracking-tight text-white font-sans">
                  Purge Subscriber?
                </h3>
                <p className="text-white/60 text-xs leading-relaxed">
                  Are you absolutely sure you want to remove <strong className="text-white select-all block my-1 font-mono">{selectedSubscriberForDelete.email}</strong> from your curation list? This action is irreversible.
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setSelectedSubscriberForDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium text-xs py-3 rounded-full hover:bg-white/5 active:scale-98 transition-all cursor-pointer border border-white/10 disabled:opacity-60"
                  id="admin-delete-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubscriber}
                  disabled={isDeleting}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium text-xs py-3 rounded-full active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  id="admin-delete-confirm"
                >
                  {isDeleting ? (
                    <RotateCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    "Confirm Purge"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
