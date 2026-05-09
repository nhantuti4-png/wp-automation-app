import React, { useState, useEffect } from 'react';
import { Play, Pause, RefreshCcw, HardDrive, FileImage, CheckCircle, AlertCircle, History, Settings as SettingsIcon, LayoutDashboard, Trash2 } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { OptimizerSettingsUI } from './OptimizerSettings';

interface OptimizerLog {
  timestamp: string;
  level: 'info' | 'success' | 'error';
  message: string;
  details?: any;
}

interface OptimizerStatus {
  lastProcessedMediaId: number;
  mappings: Record<string, any>;
  stats: {
    processedCount: number;
    spaceSavedBytes: number;
    errorCount: number;
    deletedCount: number;
    skippedCount: number;
  };
  logs: OptimizerLog[];
  status: 'idle' | 'running' | 'paused';
  isProcessing: boolean;
}

export const ImageOptimizerDashboard: React.FC = () => {
  const [status, setStatus] = useState<OptimizerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'settings'>('stats');
  const lastFetchRef = React.useRef<number>(0);
  const skipFetchUntilRef = React.useRef<number>(0);

  const fetchStatus = async (force = false) => {
    const now = Date.now();
    
    // Skip if in cooldown after reset (unless forced, but reset specifies skip)
    if (!force && now < skipFetchUntilRef.current) {
      console.log("STATUS FETCH SKIPPED (cooldown)");
      return;
    }

    // Debounce: minimum 3s between fetches
    if (!force && now - lastFetchRef.current < 3000) {
      return;
    }

    lastFetchRef.current = now;

    try {
      // Adding cache busting query param
      const res = await axios.get(`/api/optimizer/status?t=${Date.now()}`);
      setStatus(res.data);
      setError(null);
    } catch (e: any) {
      if (e.response?.status === 429) {
        console.warn("Rate limited, retrying...");
        // Do not set error state for 429, just keep previous status if any
        return;
      }
      console.error("Failed to fetch optimizer status", e);
      setError("Backend not running - Không thể kết nối tới server dọn dẹp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    
    // Polling every 4 seconds, using a wrapper to avoid passing interval args
    const interval = setInterval(() => {
      fetchStatus();
    }, 4000);
    
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      await axios.post('/api/optimizer/start');
      fetchStatus();
    } catch (e: any) {
      alert("Lỗi khi khởi động: " + (e.response?.data?.error || e.message));
    }
  };

  const handleStop = async () => {
    try {
      await axios.post('/api/optimizer/stop');
      fetchStatus();
    } catch (e: any) {
      alert("Lỗi khi dừng: " + (e.response?.data?.error || e.message));
    }
  };

  const handleCleanup = async () => {
    console.log("CLICK CLEANUP BUTTON");
    if (!confirm("Hệ thống sẽ chỉ chạy quy trình quét và dọn dẹp ảnh mồ côi/ảnh cũ đã tối ưu. Tiếp tục?")) return;
    
    try {
      console.log("CALL CLEANUP API");
      setLoading(true);

      const res = await fetch(`/api/optimizer/cleanup`, {
        method: 'POST'
      });

      console.log("RESPONSE STATUS:", res.status);
      
      const data = await res.json();
      console.log("RESPONSE DATA:", data);

      if (res.ok) {
        alert(data.message || "Đã yêu cầu dọn dẹp. Vui lòng theo dõi Logs.");
      } else {
        throw new Error(data.error || "Lỗi không xác định từ server");
      }

      await fetchStatus();
    } catch (err) {
      console.error("CLEANUP ERROR:", err);
      alert("Lỗi khi bắt đầu dọn dẹp: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    console.log("RESET INITIATED");
    
    try {
      setLoading(true);
      console.log("EXECUTING AGGRESSIVE RESET");
      
      // OPTIMISTIC UPDATE: Clear UI immediately
      const emptyState: OptimizerStatus = {
        lastProcessedMediaId: 0,
        mappings: {},
        stats: { 
          processedCount: 0, 
          spaceSavedBytes: 0, 
          errorCount: 0, 
          deletedCount: 0, 
          skippedCount: 0 
        },
        logs: [],
        status: 'idle',
        isProcessing: false
      };
      
      setStatus(emptyState);

      // Set cooldown to skip fetchStatus for a long time
      skipFetchUntilRef.current = Date.now() + 8000;

      console.log("CALLING BACKEND RESET...");
      await axios.post(`/api/optimizer/reset?t=${Date.now()}`);
      console.log("BACKEND RESET SUCCESSFUL");
      
      // Reset again to be sure (in case some polling returned old data in between)
      setStatus(emptyState);
      
      alert("Reset thành công! Hệ thống đã được đưa về trạng thái và nhật ký trống.");
      
      // Final sync after backend cooldown
      setTimeout(() => {
        console.log("Final status sync after reset");
        fetchStatus(true); 
      }, 9000);
    } catch (err) {
      console.error("RESET ERROR:", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert("Lỗi khi reset: " + msg);
      fetchStatus(true);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCcw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const stats = status?.stats || { processedCount: 0, spaceSavedBytes: 0, errorCount: 0, deletedCount: 0, skippedCount: 0 };
  const mappings = status?.mappings || {};
  const logs = status?.logs || [];
  
  const optimizedTotal = Object.keys(mappings).length;
  const replacedTotal = Object.values(mappings).filter((m: any) => m.replaceStatus === 'done').length;
  const verifiedTotal = Object.values(mappings).filter((m: any) => m.verifyStatus === 'success').length;
  const pendingCleanup = Object.values(mappings).filter((m: any) => m.cleanupStatus === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileImage className="text-blue-500" />
            Image Optimizer – Safe Slow Mode
          </h2>
          <div className="flex items-center gap-4 mt-2">
             <button 
              onClick={() => setActiveSubTab('stats')}
              className={`flex items-center gap-2 text-sm font-medium py-1 border-b-2 transition-all ${activeSubTab === 'stats' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               <LayoutDashboard size={14} /> Thống kê & Logs
             </button>
             <button 
              onClick={() => setActiveSubTab('settings')}
              className={`flex items-center gap-2 text-sm font-medium py-1 border-b-2 transition-all ${activeSubTab === 'settings' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               <SettingsIcon size={14} /> Cấu hình chuyên sâu
             </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={false}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg font-medium transition-colors disabled:opacity-50"
              title="Reset toàn bộ tiến trình và lịch sử"
            >
              <RefreshCcw size={18} /> Reset
            </button>
            <button
              onClick={handleCleanup}
              disabled={false}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors disabled:opacity-50"
              title="Chỉ chạy dọn dẹp (Cleanup), không tối ưu hóa ảnh mới"
            >
              <Trash2 size={18} /> Dọn dẹp ảnh (Cleanup Only)
            </button>
          </div>

          {status?.status === 'running' ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
            >
              <Pause size={18} /> Tạm dừng
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md shadow-blue-200 transition-all hover:scale-105"
            >
              <Play size={18} /> {status?.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu tối ưu'}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'stats' ? (
          <motion.div 
            key="stats"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 border border-red-100">
                <AlertCircle size={20} />
                {error}
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-500" />
                  Đã tối ưu
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {stats.processedCount.toLocaleString()}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-green-700">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2 font-sans">
                  <HardDrive size={14} className="text-blue-500" />
                  Tiết kiệm
                </div>
                <div className="text-2xl font-bold">
                  {formatSize(stats.spaceSavedBytes)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                  <RefreshCcw size={14} className="text-amber-500" />
                  Chờ xoá
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {pendingCleanup}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500" />
                  Đã xoá cũ
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {stats.deletedCount}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Pause size={14} className="text-slate-400" />
                  Bỏ qua
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {stats.skippedCount}
                </div>
              </div>
            </div>

            {/* Logs View */}
            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl border border-slate-800">
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <History size={18} />
                  Nhật ký hoạt động (Real-time)
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  ID tiếp theo: {status?.lastProcessedMediaId}
                </div>
              </div>
              
              <div className="h-[400px] overflow-y-auto p-4 font-mono text-sm space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic text-center py-20">Chưa có hoạt động nào được ghi lại.</div>
                ) : (
                  logs.map((log: any, i: number) => (
                    <motion.div 
                      key={log.timestamp + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-3 leading-relaxed"
                    >
                      <span className="text-slate-500 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={
                        log.level === 'success' ? 'text-green-400' :
                        log.level === 'error' ? 'text-red-400' :
                        'text-blue-300'
                      }>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-slate-300">{log.message}</span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
            
            {/* Footer Instructions */}
            <div className="p-4 bg-blue-50 rounded-lg text-blue-800 text-xs flex gap-3 border border-blue-100">
              <AlertCircle size={16} className="shrink-0" />
              <div>
                <p className="font-bold mb-1">Cách thức hoạt động:</p>
                <ul className="list-disc ml-4 space-y-1 opacity-80">
                  <li>Hệ thống quét Media Library tăng dần theo ID để tránh bỏ sót.</li>
                  <li>Ảnh chỉ được tối ưu nếu kích thước {'>'} 300KB hoặc rộng {'>'} 1200px.</li>
                  <li>Phiên bản WebP mới được upload lên WordPress và article content được cập nhật tự động.</li>
                  <li>Quá trình chạy chậm (nghỉ 3s mỗi ảnh) để bảo vệ server WordPress không bị quá tải.</li>
                  <li className="text-amber-700 font-medium">Cleanup (An toàn): Ảnh gốc chỉ bị xoá (vào Trash) sau ít nhất 5 phút nếu: 
                    (1) Đã có ảnh mới thay thế, 
                    (2) Không còn xuất hiện trong bài viết nào, 
                    (3) Không phải là ảnh đại diện.
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
          >
            <OptimizerSettingsUI />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
