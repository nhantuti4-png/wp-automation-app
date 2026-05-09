import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, AlertTriangle, ShieldCheck, Zap, Gauge, FileCode, MonitorPlay, Info } from 'lucide-react';
import { settingsService } from '../services/api';
import { motion, AnimatePresence } from 'motion/react';
import { OptimizerSettings } from '../types';

export const OptimizerSettingsUI: React.FC = () => {
  const [settings, setSettings] = useState<OptimizerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchSettings = async () => {
    try {
      const data = await settingsService.get('optimizer');
      setSettings(data);
    } catch (e) {
      setError("Không thể tải cấu hình.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await settingsService.save(settings, 'optimizer');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error || "Lỗi khi lưu cấu hình.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Bạn có chắc chắn muốn reset toàn bộ cài đặt về mặc định?")) return;
    
    try {
      await settingsService.save({}, 'optimizer');
      fetchSettings();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError("Lỗi khi reset cài đặt.");
    }
  };

  const updateField = (field: keyof OptimizerSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải cấu hình...</div>;
  if (!settings) return <div className="p-8 text-center text-red-500">Lỗi: Không tìm thấy cấu hình.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Modes Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <MonitorPlay className="text-blue-500" size={20} />
            <h3 className="font-bold text-slate-800">Chế độ vận hành</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 font-sans">Vận hành (Mode)</label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => updateField('mode', 'test')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                    settings.mode === 'test' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  <span className="font-bold text-sm uppercase">Test</span>
                  <span className="text-[10px] opacity-60">Xử lý ngắn, giới hạn ảnh</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('mode', 'production')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                    settings.mode === 'production' 
                      ? 'border-green-500 bg-green-50 text-green-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  <span className="font-bold text-sm uppercase">Production</span>
                  <span className="text-[10px] opacity-60">Chạy liên tục, không giới hạn</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 font-sans">Thời gian nghỉ (Delay MS)</label>
              <input 
                type="number" 
                value={settings.delay_ms}
                onChange={(e) => updateField('delay_ms', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                min="1000"
              />
              <p className="text-[10px] text-slate-400">Thời gian nghỉ giữa mỗi ảnh (ms). Min: 1000ms.</p>
            </div>
          </div>
        </div>

        {/* Optimizer settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <Zap className="text-amber-500" size={20} />
            <h3 className="font-bold text-slate-800">Tối ưu hóa (Optimizer)</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Ảnh tối đa / run</label>
              <input 
                type="number" 
                value={settings.max_images_per_run}
                onChange={(e) => updateField('max_images_per_run', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Resize Max-Width</label>
              <input 
                type="number" 
                value={settings.resize_width}
                onChange={(e) => updateField('resize_width', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">WebP Quality</label>
              <input 
                type="number" 
                value={settings.webp_quality}
                onChange={(e) => updateField('webp_quality', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                min="1" max="100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Dung lượng tối thiểu (KB)</label>
              <input 
                type="number" 
                value={settings.min_file_size_kb}
                onChange={(e) => updateField('min_file_size_kb', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Quét tối đa bài viết</label>
              <input 
                type="number" 
                value={settings.max_posts_scan}
                onChange={(e) => updateField('max_posts_scan', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Cleaner settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="text-red-500" size={20} />
              <h3 className="font-bold text-slate-800">Dọn dẹp (Cleaner)</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={settings.enable_cleaner}
                onChange={(e) => updateField('enable_cleaner', e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-sm font-medium text-slate-900">{settings.enable_cleaner ? 'Bật' : 'Tắt'}</span>
            </label>
          </div>
          <div className={`p-6 grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${!settings.enable_cleaner ? 'opacity-40 pointer-events-none' : ''}`}>
             <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Delay dọn dẹp (Phút)</label>
              <input 
                type="number" 
                value={settings.delete_delay_minutes}
                onChange={(e) => updateField('delete_delay_minutes', parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[10px] text-slate-400">Xoá ảnh gốc sau X phút kể từ khi tối ưu thành công.</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Chế độ xoá</label>
              <select 
                value={settings.delete_mode}
                onChange={(e) => updateField('delete_mode', e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="trash">Vào Trash (Khuyên dùng)</option>
                <option value="force_delete">Xoá vĩnh viễn (Nguy hiểm)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Safety section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <ShieldCheck className="text-green-500" size={20} />
            <h3 className="font-bold text-slate-800">An toàn (Safety checks)</h3>
          </div>
          <div className="p-6 space-y-4">
             <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-slate-700">Xác thực thay thế (Verify Replace)</p>
                  <p className="text-xs text-slate-400">Bắt buộc tìm thấy ảnh mới trong bài viết trước khi xoá ảnh cũ.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={settings.require_replace_verification}
                  onChange={(e) => updateField('require_replace_verification', e.target.checked)}
                  className="w-5 h-5 accent-green-600"
                />
             </div>
             <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-slate-700">Kiểm tra ảnh đại diện (Featured Image)</p>
                  <p className="text-xs text-slate-400">Không xoá nếu ảnh đang được dùng làm ảnh đại diện.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={settings.check_featured_image}
                  onChange={(e) => updateField('check_featured_image', e.target.checked)}
                  className="w-5 h-5 accent-green-600"
                />
             </div>
             <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-slate-700">Xoá khi chưa xác thực</p>
                  <p className="text-xs text-red-400">Cho phép dọn dẹp kể cả khi không tìm thấyMapping (Cực kỳ nguy hiểm).</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={settings.allow_delete_if_not_verified}
                  onChange={(e) => updateField('allow_delete_if_not_verified', e.target.checked)}
                  className="w-5 h-5 accent-red-600"
                />
             </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-6 bg-slate-50 rounded-xl border border-slate-200">
           <div className="flex items-center gap-2 text-slate-500">
              <Info size={18} />
              <p className="text-xs">Cấu hình sẽ được áp dụng ngay lập tức mà không cần restart worker.</p>
           </div>
           <div className="flex items-center gap-3 w-full md:w-auto">
             <button
                type="button"
                onClick={handleReset}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 rounded-lg font-medium transition-colors"
                disabled={saving}
              >
                <AlertTriangle size={18} /> Reset Defaults
              </button>
              <button
                type="submit"
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 transition-all hover:scale-105"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RotateCcw className="animate-spin" size={18} /> Lưu...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Lưu cài đặt
                  </>
                )}
              </button>
           </div>
        </div>
      </form>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 p-4 bg-red-600 text-white rounded-xl shadow-xl z-50 flex items-center gap-3"
          >
            <AlertTriangle />
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 p-4 bg-green-600 text-white rounded-xl shadow-xl z-50 flex items-center gap-3"
          >
            <ShieldCheck />
            Đã lưu cấu hình thành công!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
