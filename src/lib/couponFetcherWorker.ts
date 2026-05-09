import { chromium } from "playwright-extra";
import type { Browser, BrowserContext } from "playwright";
import stealth from "puppeteer-extra-plugin-stealth";
import * as cheerio from "cheerio";
import { executeWpRest, uploadWpMedia } from "./wordpressClient.ts";
import { stores } from "./memoryPersistence.ts";
import { Brand, CouponNormalized, CouponTask, AISettings } from "../types.ts";
import { AdaptiveAgent } from "./adaptiveAgent.ts";
import { CouponParser } from "./couponParser.ts";
import { RUNTIME_CONFIG } from "./runtimeConfig.ts";
import path from "path";
import sharp from "sharp";
import axios from "axios";
import { bridgeApi } from "../services/localBridge.ts";

// Using stealth plugin
chromium.use(stealth());

export class CouponFetcherWorker {
  private config: any;
  private bridgeUrl: string | null = null;
  private stopRequested = false;
  private isProcessing = false;
  private logs: string[] = [];
  private aiSettings: AISettings | null = null;
  private agent: AdaptiveAgent | null = null;
  private parser: CouponParser | null = null;

  private log(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] [${level.toUpperCase()}] ${message}`;
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();
    console.log(`[CouponFetcher] ${entry}`);
  }

  public getStatus() {
    return {
      isProcessing: this.isProcessing,
      stopRequested: this.stopRequested,
      logs: this.logs
    };
  }

  public stop() {
    this.stopRequested = true;
    this.log('warn', 'Yêu cầu dừng worker đã được gửi.');
  }

  // --- 1. LOCAL AGENT DISCOVERY ---
  private async checkLocalAgentStatus(url: string): Promise<boolean> {
    try {
      const res = await bridgeApi.get(`${url}/health`, { timeout: 3000 });
      if (res.data && res.data.status === 'online') {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // --- 2. LẤY STORE TỪ WP REST API ---
  private async getStoresFromRest(wpConfig: any): Promise<Brand[]> {
    const stores: Brand[] = [];
    try {
      this.log('info', 'Đang đọc danh sách Store từ WordPress REST API...');
      const rawStores = await executeWpRest(
        wpConfig.baseUrl,
        "GET",
        "/wp/v2/store?per_page=100&context=edit",
        null,
        wpConfig.credentials
      );

      if (Array.isArray(rawStores)) {
        for (const s of rawStores) {
          stores.push({
            id: String(s.id),
            name: s.title?.rendered || s.name || "Unknown",
            slug: s.slug || "",
            official_site: "", 
            status: 'active'
          } as Brand);
        }
      }
      return stores;
    } catch (e: any) {
      this.log('error', `Lỗi khi lấy danh sách Store qua REST API: ${e.message}`);
      return [];
    }
  }

  private async processAndUploadLogo(logoUrl: string, slug: string, wpConfig: any): Promise<number | null> {
    try {
      const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
      const buffer = Buffer.from(response.data);

      const webpBuffer = await sharp(buffer)
        .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();

      const uploadRes = await uploadWpMedia(
        wpConfig.baseUrl,
        webpBuffer,
        `${slug}.webp`,
        'image/webp',
        wpConfig.credentials
      );
      return uploadRes.id;
    } catch (e: any) {
      this.log('warn', `Lỗi xử lý ảnh logo: ${e.message}`);
      return null;
    }
  }

  private async sleep(ms: number) {
    const start = Date.now();
    while (Date.now() - start < ms && !this.stopRequested) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // --- 3. MAIN LIFECYCLE ---
  public async start(wpConfigProvider: () => Promise<any>) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.stopRequested = false;
    
    let db: any = null;

    try {
      this.log('info', 'Worker lifecycle started. Mode: AUTO_LOCAL');
      db = stores;

      // Initial config check
      this.config = await wpConfigProvider();
      this.log('info', `[WORKER] CONFIG: ${JSON.stringify(this.config, null, 2)}`);
      
      const defaultSettings: AISettings = {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        enableRecovery: true,
        trainingMode: 'auto',
        runtimeMode: 'adaptive',
        recoveryMode: 'ai_repair'
      };

      if (db) {
        try {
          const aiSnap = await db.collection("settings").doc("ai").get();
          this.aiSettings = aiSnap.exists ? { ...defaultSettings, ...aiSnap.data() } : defaultSettings;
        } catch { this.aiSettings = defaultSettings; }
      } else {
        this.aiSettings = defaultSettings;
      }
      
      this.agent = new AdaptiveAgent(this.aiSettings, db);
      this.parser = new CouponParser(this.aiSettings);

      while (!this.stopRequested) {
        // Refresh config every cycle to pick up auto-registered bridgeUrl
        this.config = await wpConfigProvider();
        this.bridgeUrl = this.config?.bridgeUrl || null;

        console.log(`[WORKER_DEBUG] bridgeUrl="${this.bridgeUrl}" from config.bridgeUrl.`);
        console.log(`[WORKER_DEBUG] Full Config: ${JSON.stringify(this.config)}`);

        if (!this.bridgeUrl) {
          this.log('warn', '[LOCAL_AGENT] No bridgeUrl registered yet. Waiting for local agent...');
          await this.sleep(15000);
          continue;
        }

        const isOnline = await this.checkLocalAgentStatus(this.bridgeUrl);
        if (!isOnline) {
          this.log('error', `[WORKER] bridge offline at ${this.bridgeUrl}`);
          await this.sleep(15000);
          continue;
        }

        this.log('success', `[WORKER] bridge online at ${this.bridgeUrl}`);
        this.log('info', `[WORKER] fetch via local bridge`);
        const storesList = await this.getStoresFromRest(this.config);
        
        for (const store of storesList) {
          if (this.stopRequested) break;
          
          let hasLock = false;
          if (db) {
            try {
              const lockRef = db.collection("brandLocks").doc(store.slug);
              const lockDoc = await lockRef.get();
              if (lockDoc.exists && lockDoc.data()?.processing && lockDoc.data()?.processing_until > Date.now()) continue;
              await lockRef.set({ processing: true, processing_until: Date.now() + 15 * 60 * 1000 });
              hasLock = true;
            } catch {}
          }

          try {
            await this.processStore(store, db);
          } catch (e: any) {
            this.log('error', `Lỗi xử lý ${store.name}: ${e.message}`);
          } finally {
            if (db && hasLock) await db.collection("brandLocks").doc(store.slug).update({ processing: false }).catch(() => null);
            await this.sleep(3000);
          }
        }

        if (this.stopRequested) break;
        this.log('success', 'Cycle complete. Next scan in 1 hour.');
        await this.sleep(3600000);
      }
    } catch (e: any) {
      this.log('error', `Worker Fatal: ${e.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processStore(store: Brand, db: any) {
    const taskId = `${store.slug}_${Date.now()}`;
    if (db) {
      await db.collection("couponTasks").doc(taskId).set({
        id: taskId, brandId: store.slug, brandName: store.name,
        status: 'coupon_pending', lastUpdated: new Date().toISOString()
      }).catch(() => null);
    }

    try {
      this.log('info', `[LOCAL_AGENT] Fetching "${store.name}"...`);
      if (db) await db.collection("couponTasks").doc(taskId).update({ status: 'coupon_fetching' }).catch(() => null);

      const searchUrl = `https://simplycodes.com/store/${store.slug}`;
      const res = await bridgeApi.post(`${this.bridgeUrl}/fetch`, { url: searchUrl, brand: store.name }, { timeout: 120000 });
      
      if (!res.data || !res.data.success) {
        throw new Error("Local Agent bridge returned failure.");
      }

      this.log('success', `[LOCAL_AGENT] Browser actions complete locally.`);
      const coupons = this.parseHtml(res.data.html, 'LocalAgent', store.name);
      const logoUrl = res.data.logoUrl || null;

      if (coupons.length === 0) {
        this.log('info', `[DONE] No coupons found for ${store.name}.`);
        if (db) await db.collection("couponTasks").doc(taskId).update({ status: 'coupon_done', foundCount: 0 }).catch(() => null);
        return;
      }

      const deduplicated = this.intelligenceLayer(coupons);
      const scored = this.scoreCoupons(deduplicated);
      const finalSelection = [
        ...scored.filter(c => c.type === 'coupon').slice(0, 4),
        ...scored.filter(c => c.type === 'deal').slice(0, 2)
      ];

      let mediaId: number | null = null;
      if (logoUrl && logoUrl.startsWith('http')) {
        mediaId = await this.processAndUploadLogo(logoUrl, store.slug, this.config);
      }

      await this.syncStoreToWp(store, finalSelection, mediaId);
      if (db) await db.collection("couponTasks").doc(taskId).update({ status: 'coupon_done', syncedCount: finalSelection.length }).catch(() => null);
      this.log('success', `[SUCCESS] ${store.name} updated with ${finalSelection.length} offers.`);

    } catch (e: any) {
      if (db) await db.collection("couponTasks").doc(taskId).update({ status: 'coupon_failed', errorMessage: e.message }).catch(() => null);
      throw e;
    }
  }

  // --- HELPERS ---
  private extractDiscountInfo(title: string): { type: CouponNormalized['discountType'], value: number } {
    const percMatch = title.match(/(\d+)\s*%/);
    if (percMatch) return { type: 'percentage', value: parseInt(percMatch[1]) };
    const fixedMatch = title.match(/\$\s*(\d+)/);
    if (fixedMatch) return { type: 'fixed', value: parseInt(fixedMatch[1]) };
    if (title.toLowerCase().includes('free shipping')) return { type: 'shipping', value: 0 };
    return { type: 'other', value: 0 };
  }

  private parseHtml(html: string, source: string, brandName: string): CouponNormalized[] {
    const $ = cheerio.load(html);
    const results: CouponNormalized[] = [];
    
    $('[class*="coupon-card" i], .store-coupon-card, .coupon-row').each((_, el) => {
      const code = $(el).find('[class*="code" i], .coupon-code').text().trim();
      const title = $(el).find('h3, .coupon-title, [class*="title" i]').first().text().trim();
      
      if (title && title.length > 5) {
        const { type, value } = this.extractDiscountInfo(title);
        results.push({
          store: brandName,
          code: code || null,
          title: title.split('\n')[0].trim(),
          type: code ? 'coupon' : 'deal',
          discountType: type,
          discountValue: value,
          source: [source],
          verified: $(el).text().toLowerCase().includes('verified'),
          score: 0,
          affiliateUrl: "",
          lastSeen: new Date().toISOString()
        } as CouponNormalized);
      }
    });
    return results;
  }

  private intelligenceLayer(raw: CouponNormalized[]): CouponNormalized[] {
    const map = new Map<string, CouponNormalized>();
    for (const item of raw) {
      const cleanCode = (item.code || "").toLowerCase().replace(/[^a-z0-9]+/g, '');
      const key = `${item.store.toLowerCase().replace(/\s+/g, '-')}-${cleanCode || 'deal-' + item.title.toLowerCase().substring(0, 20).replace(/[^a-z0-9]+/g, '')}`;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.source = Array.from(new Set([...existing.source, ...item.source]));
        existing.verified = existing.verified || item.verified;
      } else map.set(key, { ...item });
    }
    return Array.from(map.values());
  }

  private scoreCoupons(items: CouponNormalized[]): CouponNormalized[] {
    return items.map(c => {
      let score = (c.discountValue * 5) + (c.source.length * 10);
      if (c.verified) score += 20;
      if (c.discountValue > 90) score -= 100;
      return { ...c, score };
    }).sort((a, b) => b.score - a.score);
  }

  private async syncStoreToWp(store: Brand, coupons: CouponNormalized[], mediaId: number | null) {
    const payload = {
      store_info: { id: store.id, name: store.name, slug: store.slug, domain: "" },
      config: { max_coupons: 4, max_deals: 2, sync_mode: "upsert" },
      payload: coupons.map(c => ({
        title: c.title, code: c.code, type: c.type,
        discount_type: c.discountType, discount_value: c.discountValue,
        source: c.source, verified: c.verified, score: c.score,
        featured_media: mediaId, last_seen: c.lastSeen
      }))
    };
    await executeWpRest(this.config.baseUrl, "POST", "/coupon/v1/upsert", payload, this.config.credentials);
  }
}
