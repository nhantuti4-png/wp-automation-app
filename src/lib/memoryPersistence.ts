import fs from "fs";
import path from "path";

/**
 * MemoryPersistence: A server-side persistence layer that loads all data into RAM
 * on startup, uses RAM for fast operations, and periodically syncs to the 
 * filesystem in the ./train/ directory.
 */

import { xxx } from "../services/localBridge.ts";

const TRAIN_DIR = path.join(process.cwd(), "train");
const CONFIG_DIR = path.join(TRAIN_DIR, "config");
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL || "";

// Ensure structure exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
}

ensureDir(TRAIN_DIR);
ensureDir(CONFIG_DIR);

export class MemoryStore<T extends { id?: string }> {
  private cache: Map<string, T> = new Map();
  private filePath: string;
  private lastSaved: number = 0;
  private dirty: boolean = false;
  private agentEndpoint: string | null = null;
  private readyPromise: Promise<void>;
  private collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;

    if (collectionName === "settings") {
      this.filePath = path.join(CONFIG_DIR, "settings.json");
    } else {
      this.filePath = path.join(TRAIN_DIR, `${collectionName}.json`);
    }
    
    // Map to endpoint
    const name = collectionName.toLowerCase();
    if (name.includes('memory')) this.agentEndpoint = 'memory';
    else if (name.includes('settings')) this.agentEndpoint = 'settings';
    else if (name.includes('selectors')) this.agentEndpoint = 'selectors';
    else if (name.includes('logs')) this.agentEndpoint = 'logs';
    else if (name.includes('brands')) this.agentEndpoint = 'brands';
    else if (name.includes('recovery')) this.agentEndpoint = 'recovery';
    else if (name.includes('workflow')) this.agentEndpoint = 'workflow';
    else if (name.includes('behavior')) this.agentEndpoint = 'behavior';
    
    this.readyPromise = this.bootstrap();
  }

  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async bootstrap() {
    // 1. Try Local Agent first (Priority)
    if (LOCAL_AGENT_URL && this.agentEndpoint) {
      try {
        console.log(`[Persistence] Attempting to load ${this.collectionName} from Agent...`);
        const res = await bridgeApi.get(`${LOCAL_AGENT_URL}/${this.agentEndpoint}`, { 
          timeout: 3000
        });
        const data = res.data;
        if (data && (Array.isArray(data) || typeof data === 'object')) {
           this.loadData(data);
           console.log(`[Persistence] Successfully loaded ${this.collectionName} from Agent.`);
           return;
        }
      } catch (err) {
        console.warn(`[Persistence] Failed to connect to Agent for ${this.collectionName}, falling back to disk.`);
      }
    }

    // 2. Fallback to Disk
    this.loadFromDisk();
  }

  private loadData(data: any) {
    this.cache.clear();
    if (!data) return;

    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        // If item doesn't have an ID but is an object, we might want to skip or generate one, 
        // but typically these collections always have IDs.
        if (item && typeof item === 'object') {
          const id = item.id || item.ID || item.key;
          if (id) this.cache.set(String(id), { ...item, id: String(id) });
        }
      });
    } else if (typeof data === 'object') {
      // For object-style stores like settings or selectors
      Object.entries(data).forEach(([key, val]: [string, any]) => {
         if (val && typeof val === 'object') {
           this.cache.set(key, { ...val, id: key });
         } else {
           this.cache.set(key, { value: val, id: key } as any);
         }
      });
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const data = JSON.parse(raw);
        this.loadData(data);
        console.log(`[Persistence] Loaded ${this.cache.size} items for ${this.collectionName} from disk`);
      }
    } catch (err) {
      console.error(`[Persistence] Failed to load ${this.collectionName}:`, err);
    }
  }

  public async saveToDisk() {
    if (!this.dirty) return;
    
    const data = Array.from(this.cache.values());

    // 1. Try Local Agent first
    if (LOCAL_AGENT_URL && this.agentEndpoint) {
      try {
        await bridgeApi.post(`${LOCAL_AGENT_URL}/${this.agentEndpoint}`, data, { 
          timeout: 5000
        });
        console.log(`[Persistence] Saved ${this.collectionName} to Agent.`);
        this.dirty = false;
        this.lastSaved = Date.now();
        // Fallthrough to mirror on disk
      } catch (err) {
        console.warn(`[Persistence] Failed to save to Agent for ${this.collectionName}, using disk fallback.`);
      }
    }

    // 2. Local Disk Mirror
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
      this.lastSaved = Date.now();
      this.dirty = false;
      console.log(`[Persistence] Saved ${this.collectionName} to local disk`);
    } catch (err) {
      console.error(`[Persistence] Failed to save ${this.collectionName} to disk:`, err);
    }
  }

  public getItem(id: string): T | undefined {
    return this.cache.get(id);
  }

  public getAll(): T[] {
    return Array.from(this.cache.values());
  }

  public find(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  public findOne(predicate: (item: T) => boolean): T | undefined {
    return this.getAll().find(predicate);
  }

  public set(id: string, data: T) {
    this.cache.set(id, { ...data, id });
    this.dirty = true;
    
    // Immediate async save if using agent
    if (LOCAL_AGENT_URL && this.agentEndpoint) {
      this.saveToDisk();
    }
  }

  public delete(id: string) {
    if (this.cache.has(id)) {
      this.cache.delete(id);
      this.dirty = true;
      return true;
    }
    return false;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  // Firestore compatibility helpers on the store class itself
  public async get(id?: string): Promise<any> {
     if (id && typeof id === 'string') {
        const data = this.getItem(id);
        return {
          exists: !!data,
          data: () => data
        };
     }
     
     const items = this.getAll();
     return {
        empty: items.length === 0,
        docs: items.map(data => ({
            id: data.id,
            data: () => data
        }))
     };
  }

  public where(field: string, op: string, value: any) {
      const filter = (items: any[], f: string, o: string, v: any) => {
        return items.filter((item: any) => {
          if (o === '==') return item[f] === v;
          return false;
        });
      };
      
      const results = filter(this.getAll(), field, op, value);
      return {
          get: async () => ({
              empty: results.length === 0,
              docs: results.map(data => ({
                  id: data.id,
                  data: () => data
              }))
          }),
          limit: (n: number) => ({
              get: async () => {
                  const limited = results.slice(0, n);
                  return {
                      empty: limited.length === 0,
                      docs: limited.map(data => ({
                          id: data.id,
                          data: () => data
                      }))
                  }
              }
          })
      };
  }

  public orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return {
      get: () => this.get(),
      limit: (n: number) => ({
        get: async () => {
          const items = this.getAll();
          // Optional: implement real sorting if needed, but for now just returning items is safer than crashing
          const sorted = [...items].sort((a: any, b: any) => {
             const valA = a[field];
             const valB = b[field];
             if (valA < valB) return direction === 'asc' ? -1 : 1;
             if (valA > valB) return direction === 'asc' ? 1 : -1;
             return 0;
          });
          const limited = sorted.slice(0, n);
          return {
            empty: limited.length === 0,
            docs: limited.map(data => ({
              id: data.id,
              data: () => data
            }))
          };
        }
      })
    };
  }

  public doc(id: string) {
    return {
      get: async () => {
        const data = this.getItem(id);
        return {
          exists: !!data,
          data: () => data
        };
      },
      set: async (data: any, options?: any) => {
        const existing = options?.merge ? this.getItem(id) : {};
        this.set(id, { ...existing as any, ...data, id });
      },
      update: async (data: any) => {
        const existing = this.getItem(id) || {};
        this.set(id, { ...existing as any, ...data });
      },
      delete: async () => {
        this.delete(id);
      }
    };
  }
}

// Singleton instances for the server
export const stores = {
  brands: new MemoryStore<any>("brands"),
  settings: new MemoryStore<any>("settings"),
  logs: new MemoryStore<any>("logs"),
  media: new MemoryStore<any>("media"),
  history: new MemoryStore<any>("history"),
  couponTasks: new MemoryStore<any>("couponTasks"),
  memory: new MemoryStore<any>("memory"),
  brandLocks: new MemoryStore<any>("brandLocks"),
  recovery: new MemoryStore<any>("recovery"),
  workflowCache: new MemoryStore<any>("workflowCache"),
  selectors: new MemoryStore<any>("selectors"),
  behavior: new MemoryStore<any>("behavior"),
  // screenshots are usually binary files, they should stay in filesystem but can be indexed here
  screenshots: new MemoryStore<any>("screenshots"),

  async whenAllReady() {
    await Promise.all(Object.values(this).filter(s => s instanceof MemoryStore).map((s: any) => s.whenReady()));
    console.log("[Persistence] All stores are ready.");
  },

  // Firestore-like shim
  collection(name: string) {
    const store = (this as any)[name];
    if (!store) throw new Error(`Store ${name} not found`);
    return store;
  }
};

// Periodic Sync (every 2 minutes)
setInterval(() => {
  console.log("[Persistence] Periodic sync starting...");
  Object.values(stores).forEach(s => {
    if (s && typeof (s as any).saveToDisk === 'function') {
      (s as any).saveToDisk();
    }
  });
}, 120000);

// Graceful shutdown sync
process.on('SIGINT', () => {
    console.log("[Persistence] Process exiting, saving stores...");
    Object.values(stores).forEach(s => {
      if (s && typeof (s as any).saveToDisk === 'function') {
        (s as any).saveToDisk();
      }
    });
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log("[Persistence] Process terminating, saving stores...");
    Object.values(stores).forEach(s => {
      if (s && typeof (s as any).saveToDisk === 'function') {
        (s as any).saveToDisk();
      }
    });
    process.exit(0);
});
