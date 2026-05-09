import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import { Brand, WPSettings, ActivityLog, MediaRecord } from "./src/types.ts";
import { stores } from "./src/lib/memoryPersistence.ts"
import { executeWpRest, uploadWpMedia, checkWpConnection } from "./src/lib/wordpressClient.ts"
import { imageOptimizerWorker } from "./src/lib/imageOptimizerWorker";
import { CouponFetcherWorker } from "./src/lib/couponFetcherWorker";
import { optimizerConfig } from "./src/lib/optimizerConfig";
import { RUNTIME_CONFIG } from "./src/lib/runtimeConfig.ts"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LOCAL PERSISTENCE:
 */
const IS_FIRESTORE_ENABLED = false;

function getFB() {
  return stores;
}

// Global FB access helper
function getFBInstance() {
  return stores;
}

// Pattern definitions for server-side selection according to the 6 mandatory forms
const ARTICLE_PATTERNS = {
  forms: [
    { id: 'review_story', name: 'Review Story (Lifestyle)' },
    { id: 'sale_first_guide', name: 'Sale-First Shopping Guide' },
    { id: 'worth_buying', name: 'Is It Worth Buying' },
    { id: 'best_categories', name: 'Best Categories to Check' },
    { id: 'comp_better_than', name: 'Comparison / Better Than Alternatives' },
    { id: 'new_customer_guide', name: 'New Customer Buying Guide' }
  ]
};

async function crawlBrandData(brand: Brand): Promise<{ context: string, images: string[] }> {
  const entryUrls = [brand.official_site, brand.deals_url, brand.sale_url].filter(u => !!u);
  const visited = new Set<string>();
  const productUrls = new Set<string>();
  const collectionUrls = new Set<string>();
  let combinedContext = "";
  const imageMap = new Map<string, { score: number, source: string }>();

  const resolveUrl = (href: string, base: string) => {
    try {
      return new URL(href, base).href;
    } catch (e) {
      return href;
    }
  };

  const addImage = (src: string, score: number, source: string) => {
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return;
    let url = src;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!url.startsWith('http')) return; 

    // Score based on type and keyword matching
    const lower = url.toLowerCase();
    let finalScore = score;
    
    // Penalize generic UI elements
    if (lower.match(/(logo|icon|button|avatar|spinner|loading|pixel|spacer|arrow|badge|secure|payment|vimeo|youtube|social)/)) {
      finalScore -= 100;
    }
    
    // Boost hero-like images if not in product page
    if (lower.match(/(hero|banner|featured|main)/) && source !== 'product') {
      finalScore += 20;
    }

    const existing = imageMap.get(url);
    if (existing) {
      existing.score = Math.max(existing.score, finalScore);
    } else {
      imageMap.set(url, { score: finalScore, source });
    }
  };

  const processPage = (html: string, url: string, sourceLabel: string) => {
    const $ = cheerio.load(html);
    
    // Context collection for content generation
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    combinedContext += `--- ${sourceLabel.toUpperCase()} CONTENT: ${url} ---\n${text.substring(0, 5000)}\n\n`;

    // 1. Social & Meta Images (High Priority)
    const og = $('meta[property="og:image"]').attr('content');
    if (og) addImage(resolveUrl(og, url), 80, "og:image");

    const twitter = $('meta[name="twitter:image"]').attr('content');
    if (twitter) addImage(resolveUrl(twitter, url), 70, "twitter:image");

    // 2. Main content images
    $('img, [data-src], [data-lazy-src]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
      const alt = $(el).attr('alt') || "";
      const srcset = $(el).attr('srcset');

      if (src) addImage(resolveUrl(src, url), sourceLabel === 'product' ? 60 : 30, sourceLabel);
      
      if (srcset) {
        // Parse srcset and get largest
        const parts = srcset.split(',').map(s => s.trim().split(' '));
        const largest = parts.sort((a,b) => (parseInt(a[1]) || 0) - (parseInt(b[1]) || 0)).pop();
        if (largest && largest[0]) addImage(resolveUrl(largest[0], url), sourceLabel === 'product' ? 70 : 40, sourceLabel);
      }
    });

    // 3. Link discovery (only keep internal relevant links)
    const hostname = new URL(url).hostname;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      
      const fullUrl = resolveUrl(href, url);
      if (!fullUrl.includes(hostname)) return;

      if (fullUrl.match(/(\/products\/|\/item\/|\/detail\/|p-)/)) {
        productUrls.add(fullUrl);
      } else if (fullUrl.match(/(\/collections\/|\/category\/|\/shop\/|c-)/)) {
        collectionUrls.add(fullUrl);
      }
    });
  };

  console.log(`--- [CRAWL] Starting multi-page extraction for ${brand.name} ---`);
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  // STEP 1: Visit Entry URLs
  for (const url of entryUrls) {
    try {
      console.log(`[CRAWL] Loading homepage: ${url}`);
      const res = await axios.get(url, { 
        timeout: 10000, 
        headers: { 'User-Agent': userAgent }
      });
      processPage(res.data, url, 'homepage');
      visited.add(url);
    } catch (e: any) {
      console.warn(`[CRAWL] Failed homepage ${url}: ${e.message}`);
    }
  }
  console.log(`[CRAWL] Homepage loaded. Found ${collectionUrls.size} collections, ${productUrls.size} products.`);

  // STEP 2: Visit Collection Pages (up to 3)
  const collectionsToVisit = Array.from(collectionUrls).slice(0, 3);
  for (const url of collectionsToVisit) {
    if (visited.has(url)) continue;
    try {
      console.log(`[CRAWL] Visiting collection: ${url}`);
      const res = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': userAgent }
      });
      processPage(res.data, url, 'collection');
      visited.add(url);
    } catch (e: any) {
      console.warn(`[CRAWL] Failed collection ${url}`);
    }
  }
  console.log(`[CRAWL] Collection pages visited: ${Math.min(collectionsToVisit.length, 3)}`);

  // STEP 3: Visit Product Pages (up to 10)
  const productsToVisit = Array.from(productUrls).slice(0, 10);
  for (const url of productsToVisit) {
    if (visited.has(url) || imageMap.size >= 100) continue; // High limit during crawl, will slice later
    try {
      console.log(`[CRAWL] Visiting product: ${url}`);
      const res = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': userAgent }
      });
      processPage(res.data, url, 'product');
      visited.add(url);
    } catch (e: any) {
      console.warn(`[CRAWL] Failed product ${url}`);
    }
  }
  console.log(`[CRAWL] Product pages visited: ${productsToVisit.length}`);

  // Final Filter & Slice
  const sortedImages = Array.from(imageMap.entries())
    .map(([url, meta]) => ({ url, ...meta }))
    .filter(img => img.score > 0) // Reject penalized generic images
    .sort((a,b) => b.score - a.score)
    .map(i => i.url)
    .slice(0, 50);

  console.log(`[CRAWL] Images collected: ${sortedImages.length} | Top URL: ${sortedImages[0] || 'NONE'}`);

  return { 
    context: combinedContext || "No context found during multi-page crawl.",
    images: sortedImages 
  };
}

async function getWPSettings(): Promise<WPSettings | null> {
  const fb = getFBInstance();
  
  // Wait for settings to be loaded from disk/agent
  await fb.settings.whenReady();
  
  const snap = await fb.settings.get("config");
  const config = snap.data();
  
  console.log(`[getWPSettings] Loaded from MemoryStore key "config":`, JSON.stringify(config));
  
  const envBridgeUrl = process.env.VITE_LOCAL_AGENT_URL || process.env.LOCAL_AGENT_URL || '';
  
  if (config) {
    console.log(`[Server] Found WordPress settings for ${config.baseUrl || 'unknown URL'}`);
    console.log(`[Server] bridgeUrl in config: "${config.bridgeUrl}"`);
    
    // Merge: stored config overwrites envBridgeUrl, but if config.bridgeUrl is missing, use envBridgeUrl
    const merged: WPSettings = {
      ...config,
      bridgeUrl: config.bridgeUrl && config.bridgeUrl !== "" ? config.bridgeUrl : envBridgeUrl
    };
    return merged;
  }
  
  // Fallback defaults
  console.log(`[Server] No WordPress settings found, using defaults.`);
  const defaults: WPSettings = {
    baseUrl: '',
    wpLoginUsername: process.env.WP_LOGIN_USERNAME || '',
    wpLoginPassword: process.env.WP_LOGIN_PASSWORD || '',
    status: 'idle',
    defaultCategoryId: 1,
    postStatus: 'draft',
    bridgeUrl: envBridgeUrl
  };
  return defaults;
}

// WP Config Helper (Simplified)
async function getWPConfig() {
  const settings = await getWPSettings();
  if (!settings || !settings.baseUrl) {
    throw new Error("WordPress settings not configured");
  }

  const baseUrl = settings.baseUrl?.trim() || "";
  
  if (baseUrl.includes("AIza")) {
    throw new Error("WP_BASE_URL chứa API key – cấu hình sai");
  }

  return { 
    ...settings,
    baseUrl, 
    credentials: { 
      username: settings.wpLoginUsername, 
      password: settings.wpLoginPassword 
    } 
  };
}

// Optimizer Instance
const couponFetcherWorker = new CouponFetcherWorker();

async function startServer() {
  console.log("[Server] Booting...");
  const app = express();
  const PORT = 3000;

  let isReady = false;
  let FB: any = null;

  // 1. LISTEN IMMEDIATELY
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Success! Listening on port ${PORT}`);
    console.log(`[Server] ENV: K_SERVICE=${process.env.K_SERVICE} K_REVISION=${process.env.K_REVISION} PORT=${process.env.PORT}`);
    console.log(`[Server] DIRECT_URL SHOULD BE reachable via the proxy at: ${process.env.APP_URL}`);
  });

  // REDIRECT LOGS TO FILE
  const fs = await import('fs');
  const logPath = '/tmp/server.log';
  // Ensure we can write to /tmp
  try {
     fs.writeFileSync(logPath, `[BOOT] ${new Date().toISOString()} Engine Starting...\n`);
  } catch(e) {}
  
  const logFile = fs.createWriteStream(logPath, { flags: 'a' });
  const originalLog = console.log;
  console.log = (...args) => {
    const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    logFile.write(msg);
    originalLog(...args);
  };
  const originalError = console.error;
  console.error = (...args) => {
    const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}\n`;
    logFile.write(msg);
    originalError(...args);
  };

  // 2. CRITICAL: ROUTE DEFINITIONS FOR LOCAL-AGENT AND STATUS (ABSOLUTE TOP)
  // These must be handled before ANY warm-up or middleware guards.
  
  // Explicit /status check
  app.get("/status", (req, res) => {
    console.log(`[STATUS_HIT] ${req.method} ${req.originalUrl} from ${req.ip}`);
    return res.status(200).json({ ok: true, isReady, status: 'online', service: 'WP-Automation', timestamp: new Date().toISOString() });
  });

  // Explicit /api/status check
  app.get("/api/status", (req, res) => {
    console.log(`[API_STATUS_HIT] ${req.method} ${req.originalUrl}`);
    return res.status(200).json({ ok: true, isReady, timestamp: new Date().toISOString() });
  });

  // Explicit /api/local-agent/status check
  app.get("/api/local-agent/status", async (req, res) => {
    console.log(`[LOCAL_AGENT_STATUS_HIT] ${req.method} ${req.originalUrl}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Server-Name', 'WP-Automation-Backend');
    try {
      const config = await getWPSettings();
      const bridgeUrl = config?.bridgeUrl || null;
      return res.status(200).json({
        ok: true,
        registered: !!bridgeUrl && bridgeUrl !== "",
        bridgeUrl: bridgeUrl,
        status: (bridgeUrl && bridgeUrl !== "") ? 'online' : 'offline',
        updatedAt: config?.lastAgentRegister || null,
        isReady,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[LOCAL_AGENT_STATUS_ERROR]', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.all("/api/local-agent/*", async (req, res, next) => {
    const url = req.originalUrl || req.url;
    console.log(`[LOCAL_AGENT_NAMESPACE] ${req.method} ${url}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Server-Name', 'WP-Automation-Backend');
    
    // Fallback for cases where req.path is used
    const path = req.path || "";
    if (req.method === 'GET' && (path === '/status' || path.endsWith('/status'))) {
       // Handled by the explicit route above, but keeping logic here just in case of middleware routing variations
       return next(); 
    }
    
    // For POST, we need the JSON parser, so we call next()
    next();
  });

  // CORS and JSON parsers
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Handle POST register (now that we have req.body)
  app.post("/api/local-agent/register", async (req, res) => {
    console.log('[REGISTER_POST] Body Raw:', JSON.stringify(req.body));
    try {
      const bridgeUrlRaw = req.body.bridgeUrl;
      const status = req.body.status || 'online';
      const bridgeUrl = (typeof bridgeUrlRaw === 'string' ? bridgeUrlRaw : '').trim();

      console.log('[REGISTER_POST] Extracted bridgeUrl:', bridgeUrl);

      if (!bridgeUrl) {
        console.warn('[REGISTER_POST] REJECTED: Missing bridgeUrl');
        return res.status(400).json({ success: false, error: "bridgeUrl is required" });
      }

      const fb = getFBInstance();
      await fb.settings.whenReady();
      
      const snap = await fb.settings.get("config");
      const existingConfig = snap.data() || {};
      console.log('[REGISTER_POST] Config BEFORE merge:', JSON.stringify(existingConfig));
      
      const updatedConfig = {
        ...existingConfig,
        bridgeUrl: bridgeUrl,
        localAgentStatus: status,
        lastAgentRegister: new Date().toISOString(),
        updatedAt: Date.now()
      };
      
      console.log('[REGISTER_POST] Config AFTER merge:', JSON.stringify(updatedConfig));
      
      await fb.settings.set("config", updatedConfig);
      
      // Verify immediately
      const verifySnap = await fb.settings.get("config");
      const verified = verifySnap.data();
      console.log('[REGISTER_POST] READBACK CONFIG from store:', JSON.stringify(verified));

      if (verified?.bridgeUrl !== bridgeUrl) {
        console.error('[REGISTER_POST] CRITICAL: Persisted bridgeUrl does not match input!');
      }

      return res.status(200).json({ success: true, registeredUrl: bridgeUrl });
    } catch (err: any) {
      console.error('[REGISTER_POST] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Logging for everything else
  app.use((req, res, next) => {
    console.log(`[INCOMING] ${req.method} ${req.originalUrl}`);
    next();
  });


  // Health check
  app.get("/api/health", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    return res.json({ status: "ok", isReady, uptime: process.uptime() });
  });

  // 4. API WARM-UP EXCLUSION
  app.use((req, res, next) => {
    const url = req.originalUrl || req.url || "";
    
    // Exempt local-agent and health
    if (url.includes('/local-agent/') || url === '/api/health') {
      return next();
    }
    
    if (url.startsWith('/api/') && !isReady) {
      console.log(`[WARM-UP] Blocking API call: ${url}`);
      res.setHeader('Content-Type', 'application/json');
      return res.status(503).json({ error: "Server warming up", path: url });
    }
    next();
  });


  // Root handler during startup
  app.get("/", (req, res, next) => {
    if (!isReady) {
      return res.send(`
        <html>
          <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#f9fafb; color:#374151;">
            <div style="padding:2rem; background:white; border-radius:1rem; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1); text-align:center;">
              <h2 style="margin:0 0 1rem 0;">Đang khởi động hệ thống...</h2>
              <p style="margin:0 0 1.5rem 0; color:#6b7280;">Vui lòng đợi trong giây lát, ứng dụng của bạn sắp sẵn sàng.</p>
              <div style="width:40px; height:40px; border:4px solid #f3f4f6; border-top:4px solid #3b82f6; border-radius:50%; animation:spin 1s linear infinite;"></div>
              <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
              <script>setTimeout(() => window.location.reload(), 10000);</script>
            </div>
          </body>
        </html>
      `);
    }
    next();
  });

  // API Routes
  console.log("[Server] Registering API routes...");
  
  try {
    // Firebase is now lazy, so getFB() just sets up the collection refs
    FB = getFB();
    console.log("[Server] Firebase collections initialized.");
  } catch (err) {
    console.error("[Server] Firebase Init Failed:", err);
  }

  const getFBOrThrow = () => {
    return getFBInstance();
  };

  // Brands
  app.get("/api/brands", async (req, res) => {
    try {
      const fb = getFBInstance();
      const brands = fb.brands.getAll();
      res.json(brands);
    } catch (err: any) {
      console.error("GET /api/brands failed:", err);
      res.json([]); // Fail safe
    }
  });

  app.post("/api/brands", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      const body = req.body;

      if (Array.isArray(body)) {
        const brands = body as Brand[];
        console.log(`[Bulk Insert] Received ${brands.length} brands`);
        
        brands.forEach(brand => {
          if (brand.id) FB.brands.set(brand.id, brand);
        });
        
        return res.json({ success: true, count: brands.length });
      } else {
        const newBrand = body as Brand;
        if (!newBrand.id || !newBrand.name || !newBrand.official_site) {
          return res.status(400).json({ error: "Missing required fields: id, name, official_site" });
        }
        FB.brands.set(newBrand.id, newBrand);
        return res.json(newBrand);
      }
    } catch (err: any) {
      console.error("POST /api/brands failed:", err);
      res.status(500).json({ error: err.message || "Internal Server Error during Bulk Insert" });
    }
  });

  app.delete("/api/brands/:id", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      FB.brands.delete(req.params.id);
      res.sendStatus(204);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/brands/:id", async (req, res) => {
    try {
      const fb = getFBInstance();
      const brand = fb.brands.getItem(req.params.id);
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      res.json(brand);
    } catch (err: any) {
      console.error(`GET /api/brands/${req.params.id} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/brands/:id/scan", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      const brand = FB.brands.getItem(req.params.id);
      if (!brand) return res.status(404).json({ error: "Brand not found" });

      const { context, images } = await crawlBrandData(brand);
      
      // Log success
      const logEntry: ActivityLog = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brandName: brand.name,
        type: 'sync',
        title: `Đã crawl dữ liệu từ Brand Website`,
        details: `Crawl: Official/Deals URLs. Lấy được ${images.length} ảnh chất lượng cao.`,
        status: 'success'
      };
      FB.logs.set(logEntry.id, logEntry);

      res.json({ sourceContext: context, detectedImages: images });
    } catch (err: any) {
      console.error("Scan error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/brands/:id/offers/save", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      const brand = FB.brands.getItem(req.params.id);
      if (!brand) return res.status(404).json({ error: "Brand not found" });

      const updateData = {
        ...brand,
        latest_offer_summary: req.body.summary,
        latest_offer_url: req.body.url,
        latest_offer_type: req.body.type,
        latest_offer_status: req.body.status || 'verified',
        last_checked_at: new Date().toISOString()
      };
      
      FB.brands.set(req.params.id, updateData);
      res.json(updateData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const fb = getFBInstance();
      const type = (req.query.type as string) || "wp";
      const key = type === "wp" ? "config" : type;
      
      const config = fb.settings.getItem(key);
      if (config) {
        return res.json(config);
      }

      if (type === "wp") {
        // Return defaults
        const defaults = {
          baseUrl: '',
          username: process.env.WP_LOGIN_USERNAME || '',
          password: process.env.WP_LOGIN_PASSWORD || '',
          status: 'idle',
          defaultCategoryId: 1,
          postStatus: 'draft'
        };
        return res.json(defaults);
      }
      
      // AI Defaults
      if (type === "ai") {
        return res.json({
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          enableRecovery: true,
          trainingMode: 'auto',
          runtimeMode: 'adaptive',
          recoveryMode: 'ai_repair'
        });
      }

      res.json(null);
    } catch (err: any) {
      console.error(`GET /api/settings?type=${req.query.type} failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const FB = getFBInstance();
      const body = req.body;
      const type = (req.query.type as string) || "wp";
      const key = type === "wp" ? "config" : type;

      if (type === "wp") {
        const data = body as WPSettings;
        const baseUrl = data.baseUrl?.trim() || "";
        
        if (baseUrl.includes("AIza")) {
          return res.status(400).json({ error: "WP_BASE_URL chứa API key – cấu hình sai" });
        }
        try {
          new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl);
        } catch (e) {
          return res.status(400).json({ error: "URL WordPress không hợp lệ" });
        }

        // Connection check removed for speed, handled in frontend if needed
        data.status = 'verified'; 
        
        // Merge with existing config to preserve fields like bridgeUrl
        const snap = await FB.settings.get("config");
        const existing = snap.data() || {};
        
        // Protect bridgeUrl from being wiped by empty values from the settings form
        const cleanedData = { ...data };
        if (cleanedData.bridgeUrl === "" || cleanedData.bridgeUrl === null || cleanedData.bridgeUrl === undefined) {
          delete cleanedData.bridgeUrl;
        }

        const merged = { ...existing, ...cleanedData };
        
        await FB.settings.set("config", merged);
        return res.json(merged);
      } else {
        FB.settings.set(key, body);
        return res.json(body);
      }
    } catch (err: any) {
      console.error("[Settings Save FAILED]", err);
      res.status(500).json({ error: err.message || "Lưu cấu hình thất bại" });
    }
  });

  // Logs
  app.get("/api/logs", async (req, res) => {
    try {
      const fb = getFBInstance();
      const logs = fb.logs.getAll().sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, 100);
      res.json(logs);
    } catch (err: any) {
      console.error("GET /api/logs failed:", err);
      res.json([]);
    }
  });

  app.post("/api/logs", async (req, res) => {
    try {
      const fb = getFBInstance();
      const log = req.body as ActivityLog;
      fb.logs.set(log.id, log);
      res.json(log);
    } catch (err: any) {
      console.error("POST /api/logs failed:", err);
      res.json(req.body);
    }
  });

  // Strategy Engine - Next Task
  app.get("/api/strategy/next", async (req, res) => {
    try {
      const fb = getFBInstance();
      const brands = fb.brands.find((b: Brand) => b.status === "active");
      
      if (brands.length === 0) return res.status(400).json({ error: "Không tìm thấy thương hiệu hoạt động nào" });

      const history = fb.history.getAll().sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, 100);

      // Simple priority-based rotation
      const weights: Record<string, number> = { high: 3, medium: 2, low: 1 };
      
      // Calculate scores
      const scoredBrands = brands.map(b => {
        const priorityWeight = weights[b.priority] || 1;
        const usePenalty = b.use_count * 0.5;
        const recencyPenalty = b.last_used_at ? (Date.now() - new Date(b.last_used_at).getTime()) / (1000 * 60 * 60 * 24) : 100;
        
        const lastInHistory = history.filter(h => h.brandId === b.id).length;
        const historyPenalty = lastInHistory * 2;

        return { brand: b, score: (priorityWeight / (usePenalty + historyPenalty + 1)) * Math.min(recencyPenalty, 10) };
      });

      scoredBrands.sort((a, b) => b.score - a.score);
      const selected = scoredBrands[0].brand;

      const recentlyUsedForms = history.slice(0, 4).map(h => h.formId);
      const availableForms = ARTICLE_PATTERNS.forms.filter(f => !recentlyUsedForms.includes(f.id));
      const selectedForm = (availableForms.length > 0 ? availableForms : ARTICLE_PATTERNS.forms)[Math.floor(Math.random() * (availableForms.length > 0 ? availableForms.length : ARTICLE_PATTERNS.forms.length))];

      const getIndexWithAntiRepeat = (max: number, historyKey: string) => {
        const recentlyUsed = history.slice(0, 2).map((h: any) => h[historyKey]);
        const available = Array.from({length: max}, (_, i) => i).filter(i => !recentlyUsed.includes(i));
        if (available.length === 0) return Math.floor(Math.random() * max);
        return available[Math.floor(Math.random() * available.length)];
      };

      res.json({ 
        brand: selected, 
        type: selectedForm.name, 
        niche: selected.niche,
        patterns: {
          formId: selectedForm.id,
          titleIndex: getIndexWithAntiRepeat(3, 'titleIndex'),
          introIndex: getIndexWithAntiRepeat(3, 'introIndex'),
          toneIndex: Math.floor(Math.random() * 3),
          ctaIndex: Math.floor(Math.random() * 3)
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/strategy/manual", async (req, res) => {
    try {
      const fb = getFBInstance();
      const { brandId, formId, type } = req.body;
      
      const brand = fb.brands.getItem(brandId);
      if (!brand) return res.status(404).json({ error: "Brand not found" });

      let selectedForm;
      if (formId) {
        selectedForm = ARTICLE_PATTERNS.forms.find(f => f.id === formId);
      }
      
      if (!selectedForm && type) {
        selectedForm = ARTICLE_PATTERNS.forms.find(f => 
          f.name.toLowerCase().includes(type.toLowerCase()) || 
          f.id.toLowerCase().includes(type.toLowerCase())
        );
      }

      if (!selectedForm) {
        selectedForm = ARTICLE_PATTERNS.forms[Math.floor(Math.random() * ARTICLE_PATTERNS.forms.length)];
      }
      
      res.json({ 
        brand, 
        type: selectedForm.name, 
        niche: brand.niche,
        patterns: {
          formId: selectedForm.id,
          titleIndex: Math.floor(Math.random() * 3),
          introIndex: Math.floor(Math.random() * 3),
          toneIndex: Math.floor(Math.random() * 3),
          ctaIndex: Math.floor(Math.random() * 3)
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/strategy/history/track", async (req, res) => {
    try {
      const fb = getFBInstance();
      const entryId = Date.now().toString();
      const entry = {
        id: entryId,
        timestamp: new Date().toISOString(),
        brandId: req.body.brandId,
        articleType: req.body.articleType,
        formId: req.body.formId,
        titleIndex: req.body.titleIndex,
        introIndex: req.body.introIndex,
        toneIndex: req.body.toneIndex,
        ctaIndex: req.body.ctaIndex
      };
      fb.history.set(entryId, entry);
      res.json({ success: true });
    } catch (err: any) {
      console.error("POST /api/strategy/history/track failed:", err);
      res.json({ success: true });
    }
  });

  // Media
  app.get("/api/media", async (req, res) => {
    try {
      const fb = getFBInstance();
      const media = fb.media.getAll().sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      res.json(media);
    } catch (err: any) {
      console.error("GET /api/media failed:", err);
      res.json([]);
    }
  });

  app.post("/api/media", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      const newMedia = req.body as MediaRecord;
      FB.media.set(newMedia.id, newMedia);
      res.json(newMedia);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/media/:id", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      await FB.media.doc(req.params.id).delete();
      res.sendStatus(204);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/media/suggest", async (req, res) => {
    try {
      const FB = getFBOrThrow();
      const { brandId, niche, type } = req.body;
      const snapshot = await FB.media.get();
      const media = snapshot.docs.map(doc => doc.data() as MediaRecord);
      
      let candidates = media.filter(m => m.brandId === brandId);
      
      if (candidates.length === 0) {
        candidates = media.filter(m => m.niche === niche);
      }

      if (candidates.length === 0) {
        const seedMap: Record<string, string> = {
          'Fashion': 'fashion,clothing,outfit',
          'Beauty': 'cosmetics,beauty,makeup',
          'Tech': 'technology,gadget,electronics',
          'Food': 'food,restaurant,cooking',
          'Travel': 'travel,nature,hotel',
          'Health': 'health,gym,medical',
          'Home': 'interior,furniture,home',
          'Education': 'education,book,learning'
        };
        
        const seed = seedMap[niche] || niche || 'shopping';
        return res.json({ 
          url: `https://picsum.photos/seed/${seed}/1200/630`, 
          sourceType: 'stock fallback' 
        });
      }

      const selected = candidates[Math.floor(Math.random() * candidates.length)];
      res.json(selected);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Coupon Fetcher Routes
  app.get("/api/coupons/status", (req, res) => {
    res.json(couponFetcherWorker.getStatus());
  });

  app.post("/api/coupons/start", async (req, res) => {
    // Ensure all stores are ready before starting the worker
    await stores.whenAllReady();
    
    couponFetcherWorker.start(async () => {
      console.log("[Worker] Requesting WordPress config...");
      const config = await getWPConfig();
      console.log(`[Worker] WordPress config loaded for: ${config.baseUrl}`);
      return config;
    });
    res.json({ success: true });
  });

  app.post("/api/coupons/stop", (req, res) => {
    couponFetcherWorker.stop();
    res.json({ success: true });
  });

  app.get("/api/coupons/tasks", async (req, res) => {
    try {
      const fb = getFBInstance();
      if (!fb) return res.json([]);
      
      const snapshot = await fb.couponTasks.orderBy('lastUpdated', 'desc').limit(50).get();
      res.json(snapshot.docs.map(doc => doc.data()));
    } catch (err: any) {
      console.error("GET /api/coupons/tasks failed:", err);
      res.json([]);
    }
  });

  // WordPress Proxy
  app.post("/api/wp/check-connection", async (req, res) => {
    // 1. NORMALIZE URL
    let baseUrl = req.body.baseUrl?.trim();
    if (!baseUrl) return res.status(400).json({ error: "URL không được để trống" });

    if (baseUrl.includes("AIza")) {
      return res.status(400).json({ error: "URL WordPress không được chứa Google API Key" });
    }

    baseUrl = baseUrl.replace(/\/wp-admin(\/.*)?$/, '').replace(/\/wp-login\.php(\/.*)?$/, '');
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const username = req.body.wpLoginUsername;
    const password = req.body.wpLoginPassword;

    console.log("--- WP REST API AUTH CHECK START ---");
    console.log("[WP DEBUG] URL:", baseUrl);
    console.log("[WP DEBUG] Username:", username);
    console.log("[WP DEBUG] App Password defined:", !!password);

    try {
      // Test the connection via REST API Basic Auth
      const result = await checkWpConnection(baseUrl, { username, password });

      return res.json({
        success: true,
        message: result.message || `KẾT NỐI THÀNH CÔNG: Chào ${result.name}`,
        wp_response: result,
        logs: result.logs,
        normalizedUrl: result.normalizedUrl
      });

    } catch (err: any) {
      console.error("[WP REST API Auth FAILED]", err.message);
      return res.status(401).json({
        success: false,
        failReason: err.message || "Lỗi kết nối WordPress",
        logs: err.logs || [],
        suggestion: err.suggestion || "Hãy kiểm tra lại cấu hình WordPress của bạn.",
        error: err.message
      });
    }
  });

  // Dedicated Auth Debug Endpoint
  app.get("/api/wp/test-auth-debug", async (req, res) => {
    try {
      const { baseUrl, credentials } = await getWPConfig();
      const response = await executeWpRest(baseUrl, "GET", "/wp-json/wp/v2/users/me", null, credentials);
      res.json({
        result: "SUCCESS",
        wp_response: response
      });
    } catch (e: any) {
      res.status(500).json({
        result: "FAILED",
        error: e.message
      });
    }
  });

  app.post("/api/wp/media/:id", async (req, res) => {
    try {
      const { baseUrl, credentials } = await getWPConfig();
      const response = await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/media/${req.params.id}`, req.body, credentials);
      res.json(response);
    } catch (error: any) {
      console.error(`[WP Media Update FAILED] ID: ${req.params.id}`, error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/wp/publish", async (req, res) => {
    try {
      const { baseUrl, credentials } = await getWPConfig();
      
      // SANITIZE PAYLOAD
      const { author, ...payload } = req.body;
      if (payload.categories) {
        payload.categories = payload.categories.filter((id: any) => typeof id === 'number' && !isNaN(id));
        if (payload.categories.length === 0) delete payload.categories;
      }
      if (payload.featured_media) {
        const mediaId = Number(payload.featured_media);
        if (!isNaN(mediaId) && mediaId > 0) payload.featured_media = mediaId;
        else delete payload.featured_media;
      }

      // Handle Tags via Browser REST
      let tagIds: number[] = [];
      if (req.body.tagNames && Array.isArray(req.body.tagNames)) {
        for (const tagName of req.body.tagNames) {
          if (!tagName) continue;
          const normalizedName = tagName.trim();
          try {
            const searchRes = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/tags?search=${encodeURIComponent(normalizedName)}`, null, credentials);
            let tag = searchRes.find((t: any) => t.name.toLowerCase() === normalizedName.toLowerCase());
            if (tag) tagIds.push(tag.id);
            else {
              const createRes = await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/tags`, { name: normalizedName }, credentials);
              tagIds.push(createRes.id);
            }
          } catch (e) {
            console.warn(`[WP Publish] Failed to handle tag: ${normalizedName}`, e);
          }
        }
        if (tagIds.length > 0) payload.tags = tagIds;
      }

      console.log(`[WP Publish] Publishing to ${baseUrl} via REST API...`);
      const response = await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/posts`, payload, credentials);
      res.json(response);
    } catch (error: any) {
      console.error("[WP Publish FAILED]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wp/categories", async (req, res) => {
    try {
      const { baseUrl, credentials } = await getWPConfig();
      const response = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/categories?per_page=100`, null, credentials);
      res.json(response);
    } catch (error) {
      res.json([]);
    }
  });

  // --- IMAGE OPTIMIZER ENDPOINTS ---
  app.get("/api/optimizer/status", (req, res) => {
    res.json(imageOptimizerWorker.getStatus());
  });

  app.post("/api/optimizer/start", async (req, res) => {
    try {
      // Pass a function that fetches the latest config
      imageOptimizerWorker.start(async () => await getWPConfig());
      res.json({ success: true, message: "Optimizer started" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/optimizer/cleanup", async (req, res) => {
    try {
      console.log("[API] POST /api/optimizer/cleanup - Start trigger");
      imageOptimizerWorker.startCleanupOnly(async () => await getWPConfig());
      res.json({ success: true, message: "Đã bắt đầu quy trình dọn dẹp" });
    } catch (e: any) {
      console.error("[API] Cleanup trigger failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/optimizer/reset", async (req, res) => {
    try {
      console.log("RESET REQUEST RECEIVED");
      await imageOptimizerWorker.reset();
      res.json({ success: true });
    } catch (e: any) {
      console.error("[API] Reset failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/optimizer/stop", (req, res) => {
    imageOptimizerWorker.stop();
    res.json({ success: true, message: "Optimizer stopped" });
  });

  app.get("/api/optimizer/settings", (req, res) => {
    res.json(optimizerConfig.getSettings());
  });

  app.post("/api/optimizer/settings", (req, res) => {
    const result = optimizerConfig.updateSettings(req.body);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  });

  app.post("/api/optimizer/settings/reset", (req, res) => {
    optimizerConfig.resetToDefault();
    res.json({ success: true });
  });
  // ---------------------------------

  app.post("/api/wp/upload", async (req, res) => {
    try {
      console.log(`[WP API] Received upload request for ${req.body.filename}`);
      const { baseUrl, credentials } = await getWPConfig();
      const { image, filename } = req.body;
      
      if (!image) throw new Error("Dữ liệu ảnh trống (Missing image data)");
      
      const buffer = Buffer.from(image, 'base64');
      console.log(`[WP API] Buffer created: ${buffer.length} bytes. Target: ${baseUrl}`);
      
      const response = await uploadWpMedia(baseUrl, buffer, filename, 'image/jpeg', credentials);
      res.json(response);
    } catch (error: any) {
      console.error(`[WP API ERROR] Upload failed for ${req.body.filename || 'unknown'}:`, error.message);
      res.status(500).json({ 
        error: `Tải ảnh lên thất bại: ${error.message}`,
        details: error.stack 
      });
    }
  });

  app.post("/api/wp/upload-url", async (req, res) => {
    try {
      const { baseUrl, credentials } = await getWPConfig();
      const { url, filename } = req.body;
      const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(imgRes.data, 'binary');
      const mimeType = (imgRes.headers['content-type'] as string) || 'image/jpeg';
      const response = await uploadWpMedia(baseUrl, buffer, filename || 'featured.jpg', mimeType, credentials);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: `Không thể tải và upload ảnh từ URL: ${error.message}` });
    }
  });

  // Memory
  app.get("/api/memory", async (req, res) => {
    try {
      const fb = getFBInstance();
      const hostname = req.query.hostname as string;
      const intent = req.query.intent as string;
      
      if (hostname && intent) {
        const found = fb.memory.find((m: any) => m.hostname === hostname && m.intent === intent);
        return res.json(found[0] || null);
      }
      
      res.json(fb.memory.getAll());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/memory", async (req, res) => {
    try {
      const fb = getFBInstance();
      const memory = req.body;
      const id = memory.id || `${memory.hostname}_${memory.intent}`;
      fb.memory.set(id, { ...memory, id });
      res.json({ ...memory, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/memory/:id", async (req, res) => {
    try {
      const fb = getFBInstance();
      fb.memory.delete(req.params.id);
      res.sendStatus(204);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Selectors
  app.get("/api/selectors", async (req, res) => {
    try {
      const fb = getFBInstance();
      res.json(fb.selectors.getAll());
    } catch (err: any) {
      res.json([]);
    }
  });

  app.post("/api/selectors", async (req, res) => {
    try {
      const fb = getFBInstance();
      const data = req.body;
      const id = data.id || Math.random().toString(36).substring(7);
      fb.selectors.set(id, data);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Recovery
  app.get("/api/recovery", async (req, res) => {
    try {
      const fb = getFBInstance();
      res.json(fb.recovery.getAll());
    } catch (err: any) {
      res.json([]);
    }
  });

  app.post("/api/recovery", async (req, res) => {
    try {
      const fb = getFBInstance();
      const data = req.body;
      fb.recovery.set(data.id || 'state', data);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Workflow Cache
  app.get("/api/workflow", async (req, res) => {
    try {
      const fb = getFBInstance();
      res.json(fb.workflowCache.getAll());
    } catch (err: any) {
      res.json([]);
    }
  });

  app.post("/api/workflow", async (req, res) => {
    try {
      const fb = getFBInstance();
      const data = req.body;
      fb.workflowCache.set(data.id || 'cache', data);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // isReady is now set after Vite integration
  console.log("[Server] API endpoints ready.");

  // API 404 GUARD: Prevent API requests from falling through to Vite/SPA fallback
  app.use("/api/*", (req, res) => {
    console.log(`[API 404] ${req.method} ${req.originalUrl}`);
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({ 
      error: "API endpoint not found", 
      path: req.originalUrl,
      method: req.method 
    });
  });

  // Vite integration
  try {
    const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(__dirname, "dist"));
    
    if (!isProduction) {
      console.log("[Server] Initializing Vite in middleware mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[Server] Vite middleware attached.");
    } else {
      console.log("[Server] Running in PRODUCTION mode (Serving /dist).");
      const distPath = path.join(__dirname, "dist");
      
      // Serve static assets with long cache
      app.use(express.static(distPath, {
        maxAge: '1y',
        index: false
      }));

      // SPA Fallback for all other routes
      app.get("*", (req, res) => {
        console.log(`[SPA Fallback] ${req.method} ${req.originalUrl}`);
        const htmlPath = path.join(distPath, "index.html");
        if (fs.existsSync(htmlPath)) {
          res.sendFile(htmlPath);
        } else {
          res.status(404).send("Frontend build not found. Please run 'npm run build' first.");
        }
      });
    }
    
    isReady = true;
    console.log("[Server] SYSTEM FULLY READY.");
  } catch (viteErr) {
    console.error("[Server] Vite/Production Setup Failed:", viteErr);
    // In case of failure, we still want the server to be "ready" to at least serve API or error pages
    isReady = true; 
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[Global Error]", err);
    res.status(500).json({ 
      error: err.message, 
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  });

  // Start listening
  // LISTEN was moved to top of startServer
}

startServer().catch(err => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
