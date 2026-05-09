import { AISettings, WorkflowMemory } from '../types.ts';
import { memoryService, settingsService } from '../services/api.ts';
import { DurableStorage as durableStorage } from './browserPersistence.ts';

// Strategy for server-side persistence (Worker)
let serverStores: any = null;
if (typeof window === 'undefined') {
  // Use dynamic import to avoid bundling server-only code in client
  // But since we are in a simple environment, we can just try/catch
  try {
    const memoryPersistence = require('./memoryPersistence');
    serverStores = memoryPersistence.stores;
  } catch (e) {
    // Fail silently, maybe we are in a different Node context
  }
}

/**
 * Persistence Manager: Orchestrates high-level data operations.
 * Uses plain array filtering for LocalBridge/DurableStorage compatibility.
 */
export const persistenceManager = {
  // --- AI SETTINGS ---
  async getAISettings(): Promise<AISettings> {
    const defaultSettings: AISettings = {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      enableRecovery: true,
      trainingMode: 'auto',
      runtimeMode: 'adaptive',
      recoveryMode: 'ai_repair'
    };

    try {
      if (serverStores) {
        const snap = await serverStores.settings.get("ai");
        if (snap.exists) return { ...defaultSettings, ...snap.data() };
      }
      const settings = await settingsService.get('ai');
      if (settings && (settings as any).provider) {
        return { ...defaultSettings, ...settings } as any;
      }
    } catch (e) {
      console.warn("[Persistence] getAISettings failed, using defaults.", e);
    }

    return defaultSettings;
  },

  async saveAISettings(settings: AISettings): Promise<boolean> {
    try {
      if (serverStores) {
        await serverStores.settings.set("ai", settings);
      }
      await settingsService.save(settings, 'ai');
      return true;
    } catch (e) {
      console.error("[Persistence] saveAISettings failed.", e);
      return false;
    }
  },

  // --- WORKFLOW MEMORY ---
  async getMemory(hostname: string, intent: string): Promise<WorkflowMemory | null> {
    try {
      // 1. Server-side Priority
      if (serverStores) {
        const results = await serverStores.memory.getAll();
        const matched = results.find((m: any) => m.hostname === hostname && m.intent === intent);
        if (matched) return matched as WorkflowMemory;
      }

      // 2. Client-side DurableStorage Pattern
      const memory = await durableStorage.load<WorkflowMemory[]>("memory") || [];
      const matched = memory.find(x => x.hostname === hostname && x.intent === intent);
      
      if (matched) return matched;
      
      // 3. API Fallback (if not in durable yet)
      return await memoryService.get(hostname, intent);
    } catch (e) {
      console.warn("[Persistence] Memory fetch failed:", e);
      return null;
    }
  },

  async saveMemory(memory: WorkflowMemory): Promise<void> {
    memory.updatedAt = new Date().toISOString();
    try {
      // 1. Server-side
      if (serverStores) {
        const id = memory.id || `${memory.hostname}_${memory.intent}`;
        await serverStores.memory.set(id, memory);
      }

      // 2. Client-side DurableStorage Pattern
      const all = await durableStorage.load<WorkflowMemory[]>("memory") || [];
      const idx = all.findIndex(m => m.id === memory.id || (m.hostname === memory.hostname && m.intent === memory.intent));
      
      if (idx >= 0) all[idx] = memory;
      else all.push(memory);
      
      await durableStorage.save("memory", all);

      // 3. API Sync
      await memoryService.save(memory);
      
      console.log(`[Persistence] Saved memory. Total count: ${all.length}`);
    } catch (e) {
      console.error("[Persistence] Memory save failed:", e);
    }
  },

  async getAllMemories(): Promise<WorkflowMemory[]> {
    try {
      let results: WorkflowMemory[] = [];
      if (serverStores) results = await serverStores.memory.getAll();
      else {
        const local = await durableStorage.load<WorkflowMemory[]>("memory");
        if (local && local.length > 0) results = local;
        else results = await memoryService.getAll();
      }
      console.log(`[AdaptiveMemory] Loaded ${results.length} total workflows.`);
      return results;
    } catch (e) {
      console.warn("[Persistence] getAllMemories failed.", e);
      return [];
    }
  },

  async deleteMemory(id: string): Promise<boolean> {
    try {
      if (serverStores) await serverStores.memory.delete(id);
      
      const all = await durableStorage.load<WorkflowMemory[]>("memory") || [];
      await durableStorage.save("memory", all.filter(m => m.id !== id));
      
      await memoryService.delete(id);
      return true;
    } catch (e) {
      console.error("[Persistence] deleteMemory failed.", e);
      return false;
    }
  },

  // --- SELECTORS ---
  async getSelectors(): Promise<Record<string, any>> {
    try {
      if (serverStores) {
        const snap = await serverStores.selectors.get();
        return snap.docs.reduce((acc: any, doc: any) => ({ ...acc, [doc.id]: doc.data() }), {});
      }
      return await durableStorage.load<Record<string, any>>("selectors") || {};
    } catch (e) {
      return {};
    }
  },

  async saveSelector(key: string, selector: any): Promise<void> {
    try {
      const all = await this.getSelectors();
      all[key] = selector;
      
      if (serverStores) await serverStores.selectors.set(key, selector);
      await durableStorage.save("selectors", all);
      console.log(`[AdaptiveMemory] Learned selector for: ${key}`);
    } catch (e) {
      console.error("[Persistence] saveSelector failed.", e);
    }
  },

  // --- WORKFLOWS ---
  async saveWorkflowCache(key: string, steps: any[]): Promise<void> {
    try {
      if (serverStores) await serverStores.workflowCache.set(key, { steps, updatedAt: new Date().toISOString() });
      
      const all = await durableStorage.load<Record<string, any>>("workflow") || {};
      all[key] = { steps, updatedAt: new Date().toISOString() };
      await durableStorage.save("workflow", all);
    } catch (e) {
      console.error("[Persistence] saveWorkflowCache failed.", e);
    }
  }
};

