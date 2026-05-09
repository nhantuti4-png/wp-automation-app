import axios from 'axios';
import { Brand, WPSettings, ActivityLog, MediaRecord, ImageSourceType } from '../types.ts';
import { DurableStorage } from '../lib/browserPersistence.ts';

const api = axios.create({ baseURL: '/api' });

// --- DURABLE KEYS ---
const DKS = {
  BRANDS: 'brands',
  SETTINGS_WP: 'settings_wp',
  SETTINGS_AI: 'settings_ai',
  SETTINGS_OPTIMIZER: 'settings_optimizer',
  LOGS: 'logs',
  MEDIA: 'media',
  HISTORY: 'history',
  COUPON_TASKS: 'coupon_tasks',
  MEMORY: 'memory'
};

export const brandService = {
  getAll: () => api.get<Brand[]>('/brands').then(async r => {
    let brands: Brand[] = Array.isArray(r.data) ? r.data : [];
    if (brands.length > 0) await DurableStorage.save(DKS.BRANDS, brands);
    return brands;
  }).catch(async err => {
    console.error("[API] Error fetching brands, using local:", err);
    return await DurableStorage.load<Brand[]>(DKS.BRANDS) || [];
  }),
  getById: (id: string) => api.get<Brand>(`/brands/${id}`).then(r => r.data),
  save: (brand: Brand) => api.post<Brand>('/brands', brand).then(async r => {
    brandService.getAll();
    return r.data;
  }),
  saveBulk: async (brands: Brand[]) => {
    const BATCH_SIZE = 100;
    const validBrands = brands.filter(b => b.name && (b.official_site || (b as any).url));
    if (validBrands.length === 0) return;

    for (let i = 0; i < validBrands.length; i += BATCH_SIZE) {
      await api.post('/brands', validBrands.slice(i, i + BATCH_SIZE));
    }
    await brandService.getAll();
  },
  delete: (id: string) => api.delete(`/brands/${id}`).then(r => {
    brandService.getAll();
    return r;
  }),
  scan: (id: string) => api.post<{ detectedOffers: any[], sourceContext: string, detectedImages?: string[] }>(`/brands/${id}/scan`).then(r => r.data),
  saveOffer: (id: string, offer: any) => api.post<Brand>(`/brands/${id}/offers/save`, offer).then(r => r.data),
  restoreFromRescue: async () => {
    const data = await DurableStorage.load<Brand[]>(DKS.BRANDS);
    if (!data || data.length === 0) return false;
    await brandService.saveBulk(data);
    return true;
  }
};

export const settingsService = {
  get: (type: 'wp' | 'ai' | 'optimizer' = 'wp') => api.get<any>(`/settings?type=${type}`).then(async r => {
    const key = type === 'wp' ? DKS.SETTINGS_WP : type === 'ai' ? DKS.SETTINGS_AI : DKS.SETTINGS_OPTIMIZER;
    if (r.data) await DurableStorage.save(key, r.data);
    return r.data;
  }).catch(async () => {
    const key = type === 'wp' ? DKS.SETTINGS_WP : type === 'ai' ? DKS.SETTINGS_AI : DKS.SETTINGS_OPTIMIZER;
    return await DurableStorage.load(key);
  }),
  save: (settings: any, type: 'wp' | 'ai' | 'optimizer' = 'wp') => api.post<any>(`/settings?type=${type}`, settings).then(async r => {
    const key = type === 'wp' ? DKS.SETTINGS_WP : type === 'ai' ? DKS.SETTINGS_AI : DKS.SETTINGS_OPTIMIZER;
    await DurableStorage.save(key, r.data);
    return r.data;
  }),
  getCategories: () => api.get<any[]>('/wp/categories').then(r => r.data),
  restoreFromRescue: async () => {
    const wp = await DurableStorage.load<WPSettings>(DKS.SETTINGS_WP);
    const ai = await DurableStorage.load(DKS.SETTINGS_AI);
    const opt = await DurableStorage.load(DKS.SETTINGS_OPTIMIZER);
    
    if (wp) await api.post('/settings?type=wp', wp);
    if (ai) await api.post('/settings?type=ai', ai);
    if (opt) await api.post('/settings?type=optimizer', opt);
    return !!(wp || ai || opt);
  }
};

export const strategyService = {
  getNext: () => api.get<{ brand: Brand; type: string; niche: string; patterns: any }>('/strategy/next').then(r => r.data),
  getManualTask: (brandId: string, type: string) => api.post<{ brand: Brand; type: string; niche: string; patterns: any }>('/strategy/manual', { brandId, type }).then(r => r.data),
  getLogs: () => api.get<ActivityLog[]>('/logs').then(async r => {
    if (Array.isArray(r.data)) await DurableStorage.save(DKS.LOGS, r.data);
    return r.data;
  }),
  addLog: (log: ActivityLog) => api.post<ActivityLog>('/logs', log).then(r => r.data),
  trackHistory: (data: any) => api.post('/strategy/history/track', data).then(r => r.data),
};

export const wpService = {
  publish: (data: any) => api.post('/wp/publish', data).then(r => r.data),
  checkConnection: (data?: Partial<WPSettings>) => api.post('/wp/check-connection', data).then(r => r.data),
  upload: (image: string, filename: string) => api.post('/wp/upload', { image, filename }).then(r => r.data),
  uploadUrl: (url: string, filename: string) => api.post('/wp/upload-url', { url, filename }).then(r => r.data),
  updateMedia: (id: number, data: any) => api.post(`/wp/media/${id}`, data).then(r => r.data),
};

export const mediaService = {
  getAll: () => api.get<MediaRecord[]>('/media').then(async r => {
    if (Array.isArray(r.data)) await DurableStorage.save(DKS.MEDIA, r.data);
    return r.data;
  }),
  save: (media: MediaRecord) => api.post<MediaRecord>('/media', media).then(r => r.data),
  delete: (id: string) => api.delete(`/media/${id}`),
  suggest: (brandId: string, niche: string, type: string) => api.post<{ url: string; sourceType: ImageSourceType }>('/media/suggest', { brandId, niche, type }).then(r => r.data),
};

export const couponService = {
  getStatus: () => api.get<any>('/coupons/status').then(r => r.data),
  start: () => api.post('/coupons/start').then(r => r.data),
  stop: () => api.post('/coupons/stop').then(r => r.data),
  getTasks: () => api.get<any[]>('/coupons/tasks').then(async r => {
    if (Array.isArray(r.data)) await DurableStorage.save(DKS.COUPON_TASKS, r.data);
    return r.data;
  }),
};

export const memoryService = {
  getAll: () => api.get<any[]>('/memory').then(async r => {
    if (Array.isArray(r.data)) await DurableStorage.save(DKS.MEMORY, r.data);
    return r.data;
  }),
  get: (hostname: string, intent: string) => api.get<any>('/memory', { params: { hostname, intent } }).then(r => r.data),
  save: (memory: any) => api.post<any>('/memory', memory).then(async r => {
    const all = await DurableStorage.load<any[]>(DKS.MEMORY) || [];
    const idx = all.findIndex((m: any) => m.id === r.data.id || (m.hostname === r.data.hostname && m.intent === r.data.intent));
    if (idx >= 0) all[idx] = r.data;
    else all.push(r.data);
    await DurableStorage.save(DKS.MEMORY, all);
    return r.data;
  }),
  delete: (id: string) => api.delete(`/memory/${id}`).then(async r => {
    const all = await DurableStorage.load<any[]>(DKS.MEMORY) || [];
    await DurableStorage.save(DKS.MEMORY, all.filter((m: any) => m.id !== id));
    return r.data;
  }),
  restore: async () => {
    const data = await DurableStorage.load<any[]>(DKS.MEMORY);
    if (!data) return false;
    for (const m of data) await api.post('/memory', m);
    return true;
  }
};

