import React, { useState, useEffect } from 'react';
import { Play, Square, RefreshCcw, Activity, CheckCircle, XCircle, Clock, ExternalLink, Tag, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { couponService } from '../services/api.ts';
import { CouponTask } from '../types.ts';

export function CouponFetcherDashboard() {
  const [tasks, setTasks] = useState<CouponTask[]>([]);
  const [status, setStatus] = useState({ isProcessing: false, stopRequested: false, logs: [] as string[] });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksData, statusData] = await Promise.all([
          couponService.getTasks(),
          couponService.getStatus()
        ]);
        setTasks(tasksData);
        setStatus(statusData);
      } catch (error) {
        console.error("Fetch dashboard data failed", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const handleStart = async () => {
    setLoading(true);
    try {
      await couponService.start();
      const statusData = await couponService.getStatus();
      setStatus(statusData);
      setRefreshKey(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await couponService.stop();
      const statusData = await couponService.getStatus();
      setStatus(statusData);
      setRefreshKey(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'coupon_done': return 'bg-green-100 text-green-700 border-green-200';
      case 'coupon_failed': return 'bg-red-100 text-red-700 border-red-200';
      case 'coupon_pending': return 'bg-gray-100 text-gray-600 border-gray-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'coupon_pending': return 'Đang chờ';
      case 'coupon_fetching': return 'Đang cào dữ liệu';
      case 'coupon_parsing': return 'Đang phân tích';
      case 'coupon_scoring': return 'Đang chấm điểm';
      case 'coupon_syncing': return 'Đang đồng bộ';
      case 'coupon_done': return 'Hoàn thành';
      case 'coupon_failed': return 'Thất bại';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Auto Coupon Fetcher</h2>
          <p className="text-sm text-gray-500 mt-1">Hệ thống thông minh tự động tìm kiếm, lọc và đồng bộ coupon.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium ${status.isProcessing ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}>
            <span className={`w-2 h-2 rounded-full ${status.isProcessing ? (status.stopRequested ? 'bg-amber-500' : 'bg-green-500 animate-pulse') : 'bg-gray-400'}`} />
            {status.isProcessing ? (status.stopRequested ? 'Đang dừng...' : 'Đang chạy') : 'Đã dừng'}
          </div>
          
          {status.isProcessing ? (
            <button
              onClick={handleStop}
              disabled={loading || status.stopRequested}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Square size={18} fill="currentColor" />
              <span>{status.stopRequested ? 'Đang dừng...' : 'Dừng'}</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-100"
            >
              <Play size={18} fill="currentColor" />
              <span>Bắt đầu</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Task List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Activity size={18} className="text-indigo-600" />
                Hoạt động gần đây
              </h3>
              <button 
                onClick={() => setRefreshKey(k => k + 1)}
                className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                title="Làm mới"
              >
                <RefreshCcw size={16} />
              </button>
            </div>
            
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              <AnimatePresence initial={false}>
                {tasks.length > 0 ? (
                  tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900 truncate">{task.brandName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(task.status)}`}>
                              {getStatusLabel(task.status)}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(task.lastUpdated).toLocaleTimeString()}
                            </span>
                            {task.brandDomain && (
                              <span className="flex items-center gap-1">
                                <ExternalLink size={12} />
                                {task.brandDomain}
                              </span>
                            )}
                          </div>

                          {task.errorMessage && (
                            <p className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
                              {task.errorMessage}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] text-gray-400 uppercase font-bold">Tìm thấy</span>
                              <span className="text-lg font-bold text-gray-900">{task.foundCount || 0}</span>
                            </div>
                            <div className="w-px h-8 bg-gray-100" />
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] text-gray-400 uppercase font-bold">Đồng bộ</span>
                              <span className="text-lg font-bold text-green-600">{task.syncedCount || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                      <Activity size={32} />
                    </div>
                    <p className="text-gray-500 font-medium italic">Chưa có tác vụ nào được ghi nhận.</p>
                    <p className="text-xs text-gray-400 mt-1">Nhấn 'Bắt đầu' để bot đi tìm kiếm mã giảm giá.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Logs & Stats Sidebar */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-2xl p-4 shadow-xl border border-gray-800">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live Console
            </h3>
            <div className="font-mono text-[11px] leading-relaxed h-[340px] overflow-y-auto space-y-1 custom-scrollbar">
              {status.logs.length > 0 ? (
                status.logs.map((log, i) => {
                  let colorClass = 'text-gray-400';
                  if (log.includes('[SUCCESS]')) colorClass = 'text-green-400';
                  if (log.includes('[WARN]')) colorClass = 'text-yellow-400';
                  if (log.includes('[ERROR]')) colorClass = 'text-red-400';
                  if (log.includes('[INFO]')) colorClass = 'text-blue-300';
                  
                  return (
                    <div key={i} className={`${colorClass} py-0.5 border-b border-gray-800/30`}>
                      {log}
                    </div>
                  );
                })
              ) : (
                <div className="text-gray-600 italic">Hệ thống đang chờ lệnh...</div>
              )}
            </div>
          </div>

          <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
            <div className="relative z-10">
              <h4 className="text-sm font-medium opacity-80">Mục tiêu hôm nay</h4>
              <div className="text-3xl font-bold mt-1">500+ Mã mới</div>
              <p className="text-[10px] mt-4 opacity-70 leading-relaxed uppercase tracking-widest font-bold">
                Intelligence Layer Active
              </p>
            </div>
            <div className="absolute -bottom-6 -right-6 opacity-10">
              <Tag size={120} strokeWidth={1} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
