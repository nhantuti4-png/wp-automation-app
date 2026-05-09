
import React, { useState, useEffect } from 'react';
import { Cloud, Save, Download, Key, Activity, CheckCircle, AlertCircle, Loader2, Github, Monitor, Link } from 'lucide-react';
import { githubSyncService, GistSyncConfig } from '../services/githubSync';
import { localBridgeService } from '../services/localBridge';

export const CloudSyncUI = () => {
  // Existing GitHub Gist config
  const [config, setConfig] = useState<GistSyncConfig>({
    token: '',
    gistId: '',
    enabled: false
  });

  // Local Agent config
  const [localUrl, setLocalUrl] = useState('');
  const [localOnline, setLocalOnline] = useState(false);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    // Load GitHub config
    const saved = localStorage.getItem('github_sync_config');
    if (saved) setConfig(JSON.parse(saved));

    // Load Local URL
    const savedUrl = localStorage.getItem('LOCAL_AGENT_URL') || '';
    setLocalUrl(savedUrl);
    
    // Check local status
    const checkStatus = async () => {
      const isOnline = await localBridgeService.isOnline();
      setLocalOnline(isOnline);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const saveConfig = (newCfg: GistSyncConfig) => {
    setConfig(newCfg);
    localStorage.setItem('github_sync_config', JSON.stringify(newCfg));
  };

  const handleLocalUrlChange = (url: string) => {
    setLocalUrl(url);
    localStorage.setItem('LOCAL_AGENT_URL', url);
  };

  const handleSync = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const newId = await githubSyncService.sync(config);
      if (newId) saveConfig({ ...config, gistId: newId });
      setStatus({ type: 'success', msg: 'Đã đồng bộ lên GitHub Gist thành công!' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: `Thất bại: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm("Bạn có chắc chắn muốn khôi phục dữ liệu từ GitHub? Dữ liệu hiện tại sẽ bị ghi đè.")) return;
    setLoading(true);
    setStatus(null);
    try {
      await githubSyncService.restore(config);
      setStatus({ type: 'success', msg: 'Khôi phục dữ liệu thành công! Hãy tải lại trang.' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: `Thất bại: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* --- LOCAL BRIDGE SECTION --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${localOnline ? 'bg-emerald-500' : 'bg-gray-400'}`}>
            <Monitor size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Local Bridge (C:/Train/)</h2>
            <p className="text-xs text-gray-500">Kết nối trực tiếp với ổ cứng máy tính cá nhân</p>
          </div>
          {localOnline && (
            <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              ONLINE
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Link size={14} /> Agent URL (Localhost)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="http://localhost:3001"
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={localUrl}
                onChange={(e) => handleLocalUrlChange(e.target.value)}
              />
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 transition-all"
              >
                Kết nối lại
              </button>
            </div>
          </div>
          <div className="text-[11px] text-gray-400 px-2 leading-relaxed">
            {localOnline ? (
               <div className="space-y-1">
                 <p className="text-emerald-600 font-medium font-mono">✅ Connected to Local Agent</p>
                 <p className="text-[10px] text-gray-500 font-mono italic">
                   Last active: {new Date(localBridgeService._lastSeenOnline).toLocaleTimeString()}
                 </p>
                 <p className="text-[10px] text-gray-400 font-mono truncate">Endpoint: {localBridgeService.getAgentUrl()}</p>
               </div>
            ) : localUrl ? (
               <div className="space-y-1">
                 <p className="text-amber-600 font-medium">⚠ Local Agent Offline (Configured)</p>
                 <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Fallback: Browser Storage Active</p>
               </div>
            ) : (
               <div className="space-y-1">
                 <p className="text-gray-500 font-medium">Local Agent Not Private Bridge</p>
                 <p className="text-[10px] text-gray-400">Enter a URL to bridge persistent data to your disk.</p>
               </div>
            )}
          </div>
        </div>
      </section>

      <div className="h-px bg-gray-100 w-full" />

      {/* --- GITHUB GIST SECTION --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Github size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">GitHub Cloud Sync</h2>
            <p className="text-xs text-gray-500">Bản sao lưu dự phòng trên mây qua GitHub Gist</p>
          </div>
        </div>

        <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Key size={14} /> GitHub Token (Gist scope)
              </label>
              <input
                type="password"
                placeholder="ghp_..."
                className="w-full px-4 py-2 rounded-xl border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={config.token}
                onChange={(e) => saveConfig({ ...config, token: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Activity size={14} /> Gist ID (Sẽ tự động tạo)
              </label>
              <input
                type="text"
                placeholder="Nhập ID nếu muốn dùng Gist cũ"
                className="w-full px-4 py-2 rounded-xl border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={config.gistId || ''}
                onChange={(e) => saveConfig({ ...config, gistId: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSync}
              disabled={loading || !config.token}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Push to Cloud
            </button>
            <button
              onClick={handleRestore}
              disabled={loading || !config.token || !config.gistId}
              className="px-6 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-50 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
              Restore from Cloud
            </button>
          </div>

          {status && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span className="text-sm font-medium">{status.msg}</span>
            </div>
          )}
        </div>
      </section>

      <div className="text-[10px] text-gray-400 bg-gray-50 p-4 rounded-xl">
        <p className="font-bold mb-1 uppercase tracking-wider">💡 Resilience Architecture:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><b>Disk:</b> Local Bridge writes directly to <code>C:/Train/</code> (Highest priority).</li>
          <li><b>Browser:</b> IndexedDB & LocalStorage provide immediate backup in the browser tab.</li>
          <li><b>Cloud:</b> GitHub Gist provides off-site backup for multi-device usage.</li>
        </ul>
      </div>
    </div>
  );
};
