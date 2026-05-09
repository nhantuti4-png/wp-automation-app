
/**
 * BrowserPersistence: A durable storage layer using localStorage and IndexedDB
 * to ensure that user data (brands, settings, memories) survives container rebuilds.
 */

import { localBridgeService } from "../services/localBridge.ts"

const PREFIX = "cb_durable_";

export const DurableStorage = {
  async save(key: string, data: any) {
    if (typeof window === 'undefined') return;
    try {
      // 1. Try Local Bridge (Priority 1)
      const bridgeSuccess = await localBridgeService.save(key, data);
      
      // 2. Mirror to browser anyway (Backup/Fallback)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(data));
      }
      await saveToIndexedDB(key, data);
      
      if (bridgeSuccess) {
        console.log(`[DurableStorage] Saved ${key} to Local Agent.`);
      }
    } catch (e) {
      console.warn(`[DurableStorage] Save failed for ${key}:`, e);
    }
  },

  async load<T>(key: string): Promise<T | null> {
    if (typeof window === 'undefined') return null;
    try {
      // 1. Try Local Bridge first
      const bridgeData = await localBridgeService.load<T>(key);
      if (bridgeData) {
        console.log(`[DurableStorage] Loaded ${key} from Local Agent.`);
        return bridgeData;
      }

      // 2. Fallback to IndexedDB
      const idbData = await loadFromIndexedDB<T>(key);
      if (idbData) return idbData;

      // 3. Last fallback: localStorage
      if (typeof localStorage !== 'undefined') {
        const lsData = localStorage.getItem(`${PREFIX}${key}`);
        return lsData ? JSON.parse(lsData) : null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};

async function saveToIndexedDB(key: string, data: any) {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("CouponBlogDurable", 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("store")) {
        db.createObjectStore("store");
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const tx = db.transaction("store", "readwrite");
      tx.objectStore("store").put(data, key);
      tx.oncomplete = () => resolve(true);
    };
    request.onerror = () => reject();
  });
}

async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open("CouponBlogDurable", 1);
    request.onupgradeneeded = (e: any) => {
      e.target.result.createObjectStore("store");
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("store")) return resolve(null);
      const tx = db.transaction("store", "readonly");
      const getReq = tx.objectStore("store").get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

