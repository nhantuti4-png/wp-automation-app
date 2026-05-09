/// <reference types="vite/client" />
import axios from 'axios';

/**
 * AXIOS INSTANCE FOR NGROK/BRIDGE
 * Adds the mandatory header to skip the ngrok free tier warning page.
 */
export const bridgeApi = axios.create({
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
});

export const localBridgeService = {
  _lastSeenOnline: 0,

  getAgentUrl() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlFromParam = params.get('bridge_url');
      if (urlFromParam) {
        localStorage.setItem('LOCAL_AGENT_URL', urlFromParam);
        // Async sync to server settings
        axios.get('/api/settings?type=wp').then(res => {
          const config = res.data || {};
          if (config.bridgeUrl !== urlFromParam) {
            axios.post('/api/settings?type=wp', { ...config, bridgeUrl: urlFromParam }).catch(() => null);
          }
        }).catch(() => null);

        // Optional: remove the param from URL to keep it clean
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    }
    return localStorage.getItem('LOCAL_AGENT_URL') || import.meta.env.VITE_LOCAL_AGENT_URL || '';
  },

  async isOnline(): Promise<boolean> {
    const url = this.getAgentUrl();
    if (!url) return false;
    
    try {
      const res = await bridgeApi.get(`${url}/health`, { 
        timeout: 2000
      });
      const isOnline = res.data.status === 'online';
      if (isOnline) {
        this._lastSeenOnline = Date.now();
      }
      return isOnline;
    } catch {
      const reasonablyRecent = (Date.now() - this._lastSeenOnline) < 30000;
      return reasonablyRecent;
    }
  },

  async save(key: string, data: any): Promise<boolean> {
    const url = this.getAgentUrl();
    if (!url) return false;
    
    const normalizedKey = key.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const saveUrl = `${url}/storage/save`;

    console.log(`[LocalBridge] POST -> ${saveUrl}`, { key: normalizedKey, data });

    try {
      const res = await bridgeApi.post(saveUrl, {
        key: normalizedKey,
        data: data
      }, {
        timeout: 10000
      });
      
      console.log(`[LocalBridge] SAVE SUCCESS:`, res.data);
      this._lastSeenOnline = Date.now();
      return true;
    } catch (e: any) {
      console.error(`[LocalBridge] SAVE ERROR:`, {
        url: saveUrl,
        key: normalizedKey,
        message: e.message,
        response: e.response?.data
      });
      return false;
    }
  },

  async load<T>(key: string): Promise<T | null> {
    const url = this.getAgentUrl();
    if (!url) return null;

    const normalizedKey = key.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const loadUrl = `${url}/storage/load/${normalizedKey}`;

    console.log(`[LocalBridge] GET -> ${loadUrl}`);

    try {
      const res = await bridgeApi.get(loadUrl, {
        timeout: 10000
      });
      
      console.log(`[LocalBridge] LOAD SUCCESS:`, res.data);
      
      if (res.data?.success) {
        this._lastSeenOnline = Date.now();
        return res.data.data as T;
      }
      return null;
    } catch (e: any) {
      console.warn(`[LocalBridge] LOAD ERROR:`, {
        url: loadUrl,
        key: normalizedKey,
        message: e.message,
        response: e.response?.data
      });
      return null;
    }
  },

  mapToEndpoint(key: string): string | null {
    const k = key.toLowerCase();
    if (k.includes('memory')) return 'memory';
    if (k.includes('settings')) return 'settings';
    if (k.includes('selectors')) return 'selectors';
    if (k.includes('logs')) return 'logs';
    if (k.includes('brands')) return 'brands';
    if (k.includes('recovery')) return 'recovery';
    if (k.includes('workflow')) return 'workflow';
    if (k.includes('behavior')) return 'behavior';
    return null;
  }
};
