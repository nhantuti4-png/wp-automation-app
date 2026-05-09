import React, { useState, useEffect } from 'react';
import { Settings, Brain, Zap, Save, RefreshCw, Layers, ShieldCheck, Database } from 'lucide-react';
import { AISettings, WorkflowMemory } from '../types.ts';
import { db } from '../lib/firebase.ts';
import { persistenceManager } from '../lib/persistenceManager';

export function AITrainingSettings() {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    enableRecovery: true,
    trainingMode: 'auto',
    runtimeMode: 'adaptive',
    recoveryMode: 'ai_repair'
  });
  const [memories, setMemories] = useState<WorkflowMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const s = await persistenceManager.getAISettings();
      setSettings(s);
      
      const m = await persistenceManager.getAllMemories();
      setMemories(m);
      
      if (!db) {
        setMessage('OFFLINE MODE: Using local storage.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const success = await persistenceManager.saveAISettings(settings);
      setMessage(success ? 'Settings saved successfully!' : 'Saved locally (Firestore Unavailable)');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearMemory = async (id: string) => {
    if (confirm('Are you sure you want to delete this memory entry?')) {
      try {
        await persistenceManager.deleteMemory(id);
        const m = await persistenceManager.getAllMemories();
        setMemories(m);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-1">
      {/* Configuration */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Brain size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Semantic Adaptive Workflow Engine</h3>
            <p className="text-xs text-gray-500">Hệ thống AI tự học và tái khởi chạy quy trình thu thập coupon.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase">Runtime Mode</label>
              <select 
                value={settings.runtimeMode}
                onChange={e => setSettings({...settings, runtimeMode: e.target.value as any})}
                className="w-full px-3 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl text-sm font-bold text-indigo-700 outline-none"
              >
                <option value="memory_only">Memory Only (Fast/Safe)</option>
                <option value="adaptive">Adaptive (Smart Recovery)</option>
                <option value="training">Training (Always Learn)</option>
                <option value="legacy">Legacy (Hardcoded)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase">Recovery Mode</label>
              <select 
                value={settings.recoveryMode}
                onChange={e => setSettings({...settings, recoveryMode: e.target.value as any})}
                className="w-full px-3 py-2 bg-amber-50/50 border border-amber-100 rounded-xl text-sm font-bold text-amber-700 outline-none"
              >
                <option value="retry_memory">Retry Memory</option>
                <option value="ai_repair">AI Repair Step</option>
                <option value="full_retrain">Full Retrain</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase">AI Provider</label>
                <select 
                  value={settings.provider}
                  onChange={e => setSettings({...settings, provider: e.target.value as any})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                >
                  <option value="gemini">Google Gemini (Recommended)</option>
                  <option value="openai">OpenAI (GPT-4/o)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase">AI Model</label>
                <input 
                  type="text"
                  value={settings.model}
                  onChange={e => setSettings({...settings, model: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">API Key Override</label>
              <input 
                type="password"
                placeholder="sk-..."
                value={settings.openaiApiKey || ''}
                onChange={e => setSettings({...settings, openaiApiKey: e.target.value})}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-yellow-500" />
                  <span className="text-sm font-medium">Enable Recovery</span>
                </div>
                <button 
                  onClick={() => setSettings({...settings, enableRecovery: !settings.enableRecovery})}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.enableRecovery ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${settings.enableRecovery ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-blue-500" />
                  <span className="text-sm font-medium">Training Mode</span>
                </div>
                <button 
                  onClick={() => setSettings({...settings, trainingMode: settings.trainingMode === 'auto' ? 'manual' : 'auto'})}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.trainingMode === 'auto' ? 'bg-green-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${settings.trainingMode === 'auto' ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-50">
          <p className="text-xs text-gray-400 font-medium">{message}</p>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Lưu cấu hình
          </button>
        </div>
      </div>

      {/* Workflow Memory Viewer */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Database size={18} className="text-indigo-600" />
            Semantic Workflows
          </h3>
          <button onClick={loadAll} className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[500px] p-4 space-y-3">
          {memories.length > 0 ? (
            memories.map((m) => (
              <div key={m.id} className="p-3 border border-gray-100 rounded-xl hover:border-indigo-100 transition-colors relative group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">{m.intent}</span>
                      <span className="text-sm font-bold text-gray-900">{m.hostname}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                       <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${m.successRate * 100}%` }} />
                       </div>
                       <span className="text-[10px] text-gray-400 font-bold">{Math.round(m.successRate * 100)}% reliability</span>
                    </div>
                  </div>
                  <button onClick={() => m.id && clearMemory(m.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity">×</button>
                </div>
                <div className="space-y-1 mt-2">
                  {m.steps?.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-gray-50 p-2 rounded border border-gray-100">
                      <div className="flex items-center gap-2">
                         <span className="text-indigo-600 font-bold px-1 py-0.5 bg-indigo-50 rounded">{s.action.toUpperCase()}</span>
                         <code className="text-gray-500 truncate max-w-[150px]">{s.value}</code>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        {s.strategyType} • {s.confidence}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-gray-400 space-y-2">
              <Layers size={32} opacity={0.3} />
              <p className="text-xs italic text-center">Chưa có quy trình nào được học. Chạy Auto Fetcher để bắt đầu training.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
