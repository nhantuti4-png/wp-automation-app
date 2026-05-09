import { bridgeApi } from '../services/localBridge';

/**
 * DurableStorage: Bridges local worker memory to the Local Agent's persistence API.
 */
export class DurableStorage {
  private bridgeUrl: string | null = null;

  constructor(bridgeUrl?: string) {
    if (bridgeUrl) this.bridgeUrl = bridgeUrl;
  }

  setBridgeUrl(url: string) {
    this.bridgeUrl = url;
  }

  async saveSettings(settings: any) {
    if (!this.bridgeUrl) return;
    try {
      await bridgeApi.post(`${this.bridgeUrl}/settings`, settings, { timeout: 5000 });
      console.log("[DurableStorage] Settings saved to bridge.");
    } catch (err: any) {
      console.error("[DurableStorage] Save settings failed:", err.message);
    }
  }

  async loadSettings(): Promise<any | null> {
    if (!this.bridgeUrl) return null;
    try {
      const res = await bridgeApi.get(`${this.bridgeUrl}/health`, { timeout: 3000 });
      return res.data?.config || null;
    } catch (err: any) {
      console.error("[DurableStorage] Load settings failed:", err.message);
      return null;
    }
  }

  async saveQueue(queue: any[]) {
    if (!this.bridgeUrl) return;
    try {
      await bridgeApi.post(`${this.bridgeUrl}/queue`, queue, { timeout: 5000 });
      console.log("[DurableStorage] Queue saved to bridge.");
    } catch (err: any) {
      console.error("[DurableStorage] Save queue failed:", err.message);
    }
  }
}

export const durableStorage = new DurableStorage();
