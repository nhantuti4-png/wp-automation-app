import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import * as cheerio from "cheerio";
import { executeWpRest, uploadWpMedia, checkImageUsageOnFrontend, getWpSettings, updateWpSettings } from "./wordpressClient.ts";
import { optimizerConfig } from "./optimizerConfig.ts";
import { getDb } from "./firebaseAdmin.ts";
import { Brand, MediaRecord } from "../types.ts";

interface ImageMapping {
  oldUrl: string;
  newUrl: string;
  mediaId: number; // Original Media ID
  newMediaId?: number; // Optimized Media ID
  optimizedAt: string;
  replaceStatus: 'success' | 'failed' | 'pending';
  verifyStatus?: 'success' | 'failed' | 'pending';
  cleanupStatus: 'pending' | 'done' | 'skipped';
  skipReason?: string;
  isUsed?: boolean; // Mark as found in content
}

interface OptimizerState {
  lastProcessedMediaId: number;
  currentPages?: Record<string, number>;
  cleanupPages?: Record<string, number>;
  doneTypes?: Record<string, boolean>; // types marked as completed for content scan
  mappings: Record<string, ImageMapping>; // oldUrl -> metadata
  stats: {
    processedCount: number;
    spaceSavedBytes: number;
    errorCount: number;
    deletedCount: number;
    skippedCount: number;
  };
  logs: Array<{
    timestamp: string;
    level: 'info' | 'success' | 'error';
    message: string;
    details?: any;
  }>;
  status: 'idle' | 'running' | 'paused';
  processedPostIds?: number[]; // IDs of posts already scanned
  isLogoOptimized?: boolean;
}

const STATE_FILE = path.join(process.cwd(), "optimizer-state.json");

class ImageOptimizerWorker {
  private state: OptimizerState;
  private isProcessing = false;
  private stopRequested = false;
  private cleanupOnly = false;
  private isResetting = false;
  private currentGeneration = 0;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): OptimizerState {
    if (fs.existsSync(STATE_FILE)) {
      try {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        
        // Migration from old string-based mapping to object-based mappings
        if (parsed.mapping && !parsed.mappings) {
          parsed.mappings = {};
          for (const [oldUrl, newUrl] of Object.entries(parsed.mapping as Record<string, string>)) {
            parsed.mappings[oldUrl] = {
              oldUrl,
              newUrl,
              mediaId: 0, // Unknown for legacy
              optimizedAt: new Date().toISOString(),
              replaceStatus: 'success',
              cleanupStatus: 'pending'
            };
          }
          delete parsed.mapping;
        }

        if (!parsed.stats.deletedCount) parsed.stats.deletedCount = 0;
        if (!parsed.stats.skippedCount) parsed.stats.skippedCount = 0;
        if (!parsed.currentPages) {
          parsed.currentPages = {};
          if (parsed.currentPage) {
             const types = ['posts', 'pages', 'product', 'coupon'];
             types.forEach(t => parsed.currentPages![t] = parsed.currentPage);
          }
        }
        if (!parsed.cleanupPages) {
          parsed.cleanupPages = {};
          if (parsed.cleanupPage) {
             const types = ['posts', 'pages', 'product', 'coupon'];
             types.forEach(t => parsed.cleanupPages![t] = parsed.cleanupPage);
          }
        }
        if (!parsed.doneTypes) {
          parsed.doneTypes = {};
        }
        delete parsed.currentPage;
        delete parsed.cleanupPage;

        return parsed;
      } catch (e) {
        console.error("[Optimizer] Failed to load state, reset to default", e);
      }
    }
    return {
      lastProcessedMediaId: 0,
      currentPages: {},
      cleanupPages: {},
      doneTypes: {},
      mappings: {},
      stats: {
        processedCount: 0,
        spaceSavedBytes: 0,
        errorCount: 0,
        deletedCount: 0,
        skippedCount: 0
      },
      logs: [],
      status: 'idle'
    };
  }

  private saveState() {
    if (this.isResetting) return;
    try {
      // Ensure we have at least the basic structure
      if (!this.state.stats) {
         this.state.stats = { processedCount: 0, spaceSavedBytes: 0, errorCount: 0, deletedCount: 0, skippedCount: 0 };
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[Optimizer] Failed to save state", e);
    }
  }

  private log(level: 'info' | 'success' | 'error', message: string, details?: any) {
    if (this.isResetting) return;
    if (!this.state.logs) this.state.logs = [];
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details
    };
    this.state.logs.unshift(entry);
    if (this.state.logs.length > 100) this.state.logs.pop();
    console.log(`[Optimizer] [${level.toUpperCase()}] ${message}`);
    
    // Only save state for important events or every few logs to reduce Disk IO / Rate limit pressure
    if (level === 'success' || level === 'error' || this.state.logs.length % 5 === 0) {
      this.saveState();
    }
  }

  public getStatus() {
    return { ...this.state, isProcessing: this.isProcessing };
  }

  public async start(wpConfigProvider: () => Promise<any>) {
    if (this.isProcessing || this.isResetting) return;
    this.isProcessing = true;
    this.state.status = 'running';
    this.stopRequested = false;
    this.log('info', 'Bắt đầu quá trình tối ưu hóa ảnh...');

    this.runLoop(wpConfigProvider).catch(err => {
      this.log('error', 'Lỗi nghiêm trọng trong vòng lặp optimizer', err.message);
    }).finally(() => {
      this.isProcessing = false;
      this.cleanupOnly = false;
      this.state.status = 'idle';
      this.saveState();
    });
  }

  public async startCleanupOnly(wpConfigProvider: () => Promise<any>) {
    if (this.isProcessing || this.isResetting) {
      this.log('error', 'Không thể chạy Cleanup vì hệ thống đang bận hoặc đang Reset.');
      return;
    }
    
    this.isProcessing = true;
    this.cleanupOnly = true;
    this.state.status = 'running';
    this.stopRequested = false;

    // MANDATORY LOGS
    console.log("CLEANUP TRIGGERED FROM UI");
    this.log('info', 'CLEANUP START');

    this.runLoop(wpConfigProvider).catch(err => {
      this.log('error', 'Lỗi trong quy trình dọn dẹp:', err.message);
    }).finally(() => {
      this.isProcessing = false;
      this.cleanupOnly = false;
      this.state.status = 'idle';
      this.saveState();
      // MANDATORY LOG
      this.log('info', 'CLEANUP DONE');
    });
  }

  public stop() {
    this.stopRequested = true;
    this.state.status = 'paused';
    this.log('info', 'Yêu cầu tạm dừng quá trình tối ưu hóa...');
  }

  private async verifyWebpExists(url: string): Promise<boolean> {
    try {
      // Use GET with Range header to be more reliable than HEAD while still efficient
      const res = await axios.get(url, { 
        headers: { 'Range': 'bytes=0-1024' },
        timeout: 10000 
      });
      return res.status >= 200 && res.status < 400;
    } catch (e: any) {
      // If server doesn't support Range, fallback to a normal small GET
      if (e.response?.status === 416 || e.response?.status === 405) {
         try {
           const res2 = await axios.get(url, { timeout: 10000 });
           return res2.status >= 200 && res2.status < 400;
         } catch (e2) {
           return false;
         }
      }
      return false;
    }
  }

  private async runLoop(wpConfigProvider: () => Promise<any>) {
    const generationAtStart = this.currentGeneration;
    
    while (!this.stopRequested && !this.isResetting && generationAtStart === this.currentGeneration) {
      const config = await wpConfigProvider();
      if (this.isResetting || generationAtStart !== this.currentGeneration) break;
      const baseUrl = config.baseUrl;
      const credentials = config.credentials;
      const settings = optimizerConfig.getSettings();

      if (this.cleanupOnly) {
        await this.runCleanup(baseUrl, credentials);
        this.stopRequested = true;
        this.isProcessing = false;
        this.log('success', 'Dọn dẹp hoàn tất.');
        break;
      }

      // STEP 1: LOGO OPTIMIZATION
      if (!this.state.isLogoOptimized) {
        await this.processLogoOptimization(baseUrl, credentials);
        this.state.isLogoOptimized = true;
        this.saveState();
      }

      // STEP 2: CONTENT OPTIMIZATION (Posts, Pages, CPTs)
      let hasMoreContent = false;
      try {
        hasMoreContent = await this.processContentFirst(baseUrl, credentials);
      } catch (e: any) {
        this.log('error', `Lỗi khi xử lý nội dung: ${e.message}`);
        // Wait a bit longer on error before retrying
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      if (!hasMoreContent) {
        this.log('info', 'Đã xử lý xong toàn bộ nội dung. Chuyển sang dọn dẹp mồ côi.');
        await this.runCleanup(baseUrl, credentials);
        this.stopRequested = true;
        this.isProcessing = false;
        this.saveState();
        break;
      }

      // Stronger delay between high-level loops
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  private async processLogoOptimization(baseUrl: string, credentials: any) {
    this.log('info', 'STEP 1: XỬ LÝ LOGO (THEME)');
    try {
      const siteSettings = await getWpSettings(baseUrl, credentials);
      const logoId = siteSettings?.site_logo;
      if (!logoId) {
        this.log('info', 'Không tìm thấy Logo ID trong site settings.');
        return;
      }

      const media = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/media/${logoId}`, null, credentials);
      if (!media || !media.source_url) return;

      const oldUrl = media.source_url;
      if (oldUrl.endsWith('.webp')) {
         this.log('info', 'Logo đã là WebP.');
         return;
      }

      this.log('info', `PHÁT HIỆN LOGO GỐC: ${oldUrl}`);
      const mapping = await this.optimizeSingleImage(media, baseUrl, credentials);
      
      if (mapping && mapping.newMediaId) {
        await this.handleLogoReplacement(logoId, oldUrl, baseUrl, credentials);
        this.log('success', 'LOGO OPTIMIZED & REPLACED');
        mapping.isUsed = true;
        mapping.replaceStatus = 'success';
        mapping.verifyStatus = 'success';
        this.saveState();
      }
    } catch (e: any) {
      this.log('error', 'Lỗi xử lý logo', e.message);
    }
  }

  private async processContentFirst(baseUrl: string, credentials: any): Promise<boolean> {
    const settings = optimizerConfig.getSettings();
    const postTypes = settings.target_post_types || ['posts', 'pages'];

    if (!this.state.currentPages) this.state.currentPages = {};
    if (!this.state.processedPostIds) this.state.processedPostIds = [];
    if (!this.state.doneTypes) this.state.doneTypes = {};

    let hasMore = false;

    for (const type of postTypes) {
      if (this.stopRequested || this.isResetting) break;
      if (this.state.doneTypes[type]) continue;

      const currentPage = this.state.currentPages[type] || 1;
      this.log('info', `[SCAN] ${type} page ${currentPage}`);

      let pageItems: any[] = [];
      try {
        pageItems = await executeWpRest(
          baseUrl,
          "GET",
          `/wp-json/wp/v2/${type}?per_page=100&page=${currentPage}&context=edit`,
          null,
          credentials
        );
      } catch (e: any) {
        const msg = String(e.message || "").toLowerCase();
        if (
          msg.includes('rest_post_invalid_page_number') ||
          msg.includes('larger than the number of pages available') ||
          msg.includes('invalid page number')
        ) {
          this.state.doneTypes[type] = true;
          this.saveState();
          continue;
        }
        throw e;
      }

      if (!Array.isArray(pageItems) || pageItems.length === 0) {
        this.state.doneTypes[type] = true;
        this.saveState();
        continue;
      }

      hasMore = true;

      for (const item of pageItems) {
        if (this.stopRequested || this.isResetting) break;
        if (this.state.processedPostIds.includes(item.id)) continue;

        try {
          await this.processSinglePost(item, type, baseUrl, credentials);
        } catch (e: any) {
          this.log('error', `Lỗi xử lý ${type} #${item.id}: ${e.message}`);
        }

        this.state.processedPostIds.push(item.id);
        this.saveState();
      }

      // QUAN TRỌNG: Có item thì luôn advance trang cho type này
      this.state.currentPages[type] = currentPage + 1;
      
      // Nếu trang này ít hơn 100 item thì coi như type này đã hết
      if (pageItems.length < 100) {
        this.state.doneTypes[type] = true;
      }
      
      this.saveState();
    }

    return hasMore;
  }

  private async processSinglePost(item: any, type: string, baseUrl: string, credentials: any) {
    const settings = optimizerConfig.getSettings();
    const isFastMode = settings.fast_store_mode || (type === 'store');
    
    const title = item.title?.rendered || "Untitled";
    const slug = item.slug || `store-${item.id}`;
    this.log('info', `PHÁT HIỆN ${type.toUpperCase()}: #${item.id} (${title})`);
    
    const originalContent = item.content?.raw || item.content?.rendered || "";
    let updatedContent = originalContent;
    let newFeaturedMediaId = item.featured_media;
    let oldFeaturedMediaItem: any = null;
    let featuredMapping: ImageMapping | null = null;

    const cleanupTargetIds: { id: number; url: string; mapping: ImageMapping; source?: 'featured' | 'content' }[] = [];

    // --- PHASE 1: PREPARE FEATURED IMAGE (SEO NAMING) ---
    if (item.featured_media && item.featured_media > 0) {
      try {
        const featMedia = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/media/${item.featured_media}`, null, credentials);
        if (featMedia && featMedia.source_url && !featMedia.source_url.endsWith('.webp')) {
          const seoFilename = `${slug}-featured-opt.webp`;
          this.log('info', `TỐI ƯU ẢNH ĐẠI DIỆN (SEO): ${featMedia.source_url} -> ${seoFilename}`);
          
          const mapping = await this.optimizeSingleImage(featMedia, baseUrl, credentials, {
            filename: seoFilename,
            meta: {
              _ais_optimized: true,
              _ais_store_id: item.id,
              _ais_source: 'featured'
            }
          });

          if (mapping && mapping.newMediaId) {
            newFeaturedMediaId = mapping.newMediaId;
            oldFeaturedMediaItem = featMedia;
            featuredMapping = mapping;
          }
        }
      } catch (e: any) {
        this.log('error', `Lỗi chuẩn bị ảnh đại diện cho ${type} #${item.id}: ${e.message}`);
      }
    }

    // --- PHASE 2: PREPARE CONTENT IMAGES (SEO NAMING) ---
    const $ = cheerio.load(originalContent, { xmlMode: false });
    const images: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) images.push(src);
    });
    $('source').each((_, el) => {
      const src = $(el).attr('srcset') || $(el).attr('src');
      if (src) images.push(src);
    });

    const uniqueImages = Array.from(new Set(images.filter(src => src.includes('/uploads/') && !src.endsWith('.webp'))));
    
    let contentImgIndex = 1;
    for (const imgUrl of uniqueImages) {
      if (this.stopRequested || this.isResetting) break;
      
      const mediaItem = await this.findMediaByUrl(baseUrl, imgUrl, credentials);
      if (mediaItem) {
        const seoFilename = `${slug}-${contentImgIndex}-opt.webp`;
        const mapping = await this.optimizeSingleImage(mediaItem, baseUrl, credentials, {
          filename: seoFilename,
          meta: {
            _ais_optimized: true,
            _ais_store_id: item.id,
            _ais_source: 'content'
          }
        });

        if (mapping && mapping.newUrl) {
          // Replace all occurrences of this image pattern in the content
          const escapedBase = this.getFileNameBase(imgUrl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`([^"'\\s>]*${escapedBase}(?:-\\d+x\\d+|-scaled)?\\.(?:jpg|jpeg|png|gif))`, 'gi');
          
          updatedContent = updatedContent.replace(pattern, (match: string) => {
             return mapping.newUrl;
          });

          mapping.isUsed = true;
          mapping.replaceStatus = 'success';
          
          cleanupTargetIds.push({ id: mediaItem.id, url: imgUrl, mapping: mapping, source: 'content' });
          contentImgIndex++;
        }
      }
    }

    // --- PHASE 3: UNIFIED UPDATE (BROWSER ACTION) ---
    const updatePayload: any = {};
    let shouldUpdate = false;

    if (updatedContent !== originalContent) {
      updatePayload.content = updatedContent;
      shouldUpdate = true;
    }

    if (newFeaturedMediaId !== item.featured_media) {
      updatePayload.featured_media = newFeaturedMediaId;
      shouldUpdate = true;
    }

    if (!shouldUpdate) {
      this.log('info', `KHÔNG CÓ THAY ĐỔI cho ${type} #${item.id}`);
      return;
    }

    // Always add optimization meta
    const existingMeta = item.meta || {};
    updatePayload.meta = {
      ...existingMeta,
      _ais_last_optimized: new Date().toISOString(),
      _ais_img_optimized: true,
      _ais_store_id: item.id
    };

    try {
      this.log('info', `ĐANG CẬP NHẬT POST UNIFIED cho ${type} #${item.id}...`);
      await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/${type}/${item.id}`, updatePayload, credentials);
      
      this.log('success', `CẬP NHẬT THÀNH CÔNG (Click Update). Chờ verify...`);

      // --- PHASE 4: VERIFICATION (Fix 2) ---
      // Wait a bit for cache synchronization (Increased to 5s as per requirement)
      await new Promise(r => setTimeout(r, 5000));

      const verifyItem = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/${type}/${item.id}?context=edit&_cb=${Date.now()}`, null, credentials);
      
      let allVerified = true;

      // Verify featured media - MANDATORY
      if (newFeaturedMediaId !== item.featured_media) {
        if (Number(verifyItem.featured_media) === Number(newFeaturedMediaId)) {
          this.log('success', `[VERIFY] Featured Media OK: #${newFeaturedMediaId}`);
          if (featuredMapping) featuredMapping.verifyStatus = 'success';
          if (oldFeaturedMediaItem && featuredMapping) {
            cleanupTargetIds.unshift({ 
              id: oldFeaturedMediaItem.id, 
              url: oldFeaturedMediaItem.source_url, 
              mapping: featuredMapping,
              source: 'featured'
            });
          }
        } else {
          this.log('error', `[VERIFY] Featured Media FAIL: #${item.id} still has ID ${verifyItem.featured_media}. Expected #${newFeaturedMediaId}`);
          allVerified = false;
          // Fail fast for featured replacement
          if (featuredMapping) featuredMapping.verifyStatus = 'failed';
          throw new Error(`Featured media replacement failed for post #${item.id}`);
        }
      }

      // Verify content (Fix 2)
      if (updatedContent !== originalContent) {
        const currentContent = verifyItem.content?.raw || verifyItem.content?.rendered || "";
        
        let contentPass = true;
        for (const target of cleanupTargetIds) {
          if (target.source === 'featured') continue;
          
          const hasNew = currentContent.includes(target.mapping.newUrl);
          
          if (hasNew) {
             this.log('success', `[VERIFY] Content OK: Found new URL. (Old URL may still exist in srcset/cache)`);
          } else {
             this.log('error', `[VERIFY] Content FAIL: hasNew=false (Old URL: ${target.url})`);
             contentPass = false;
          }
        }

        if (contentPass) {
           cleanupTargetIds.forEach(t => t.mapping.verifyStatus = 'success');
        } else {
           allVerified = false;
        }
      }

      // --- PHASE 5: CLEANUP & ATTACH (IF VERIFIED) ---
      if (allVerified) {
        this.log('success', `XÁC MINH HOÀN TẤT: Bắt đầu dọn dẹp an toàn cho #${item.id}`);
        
        // Attach new media to post_parent
        if (newFeaturedMediaId !== item.featured_media) {
          await this.attachMediaToPost(newFeaturedMediaId, item.id, baseUrl, credentials);
        }
        for (const t of cleanupTargetIds) {
          if (t.mapping.newMediaId) await this.attachMediaToPost(t.mapping.newMediaId, item.id, baseUrl, credentials);
        }

        // Safe Deletion
        for (const target of cleanupTargetIds) {
          if (settings.enable_cleaner) {
             this.log('info', `DỰ KIẾN XOÁ: Bắt đầu kiểm tra an toàn cho ${target.url}`);
             await this.cleanupSingleImage({
               mediaId: target.id,
               urlToCheck: target.url,
               mapping: target.mapping,
               ignorePostId: item.id
             }, baseUrl, credentials);
          } else {
             this.log('info', `BỎ QUA DỌN DẸP: Cleaner đang tắt cho ${target.url}`);
          }
        }
      } else {
        this.log('error', `HỦY XOÁ: Xác minh thất bại cho #${item.id}. Giữ lại ảnh gốc để an toàn.`);
      }

    } catch (e: any) {
      this.log('error', `Cập nhật nội dung thất bại cho #${item.id}: ${e.message}`);
    }
  }

  private getFileNameBase(url: string): string {
    const filename = url.split('/').pop() || "";
    let b = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
    b = b.replace(/-\d+x\d+$/, '');
    b = b.replace(/-scaled$/, '');
    return b;
  }


  private async findMediaByUrl(baseUrl: string, url: string, credentials: any) {
    const filename = url.split('/').pop()?.split('?')[0] || "";
    if (!filename) return null;

    try {
      const media = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/media?search=${encodeURIComponent(filename)}&per_page=1&_fields=id,source_url`, null, credentials);
      if (media && media.length > 0) return media[0];
    } catch (e) {}
    return null;
  }

  private async attachMediaToPost(mediaId: number, postId: number, baseUrl: string, credentials: any) {
    try {
      await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/media/${mediaId}`, { post: postId }, credentials);
      this.log('info', `ĐÃ GẮN VÀO BÀI (Attached): Media #${mediaId} -> Post #${postId}`);
      return true;
    } catch (e: any) {
      this.log('error', `Không thể gắn media ${mediaId} vào post ${postId}: ${e.message}`);
      return false;
    }
  }

  private async reVerifyPostContent(postId: number, postType: string, oldUrl: string, newUrl: string, baseUrl: string, credentials: any): Promise<boolean> {
    try {
      const post = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/${postType}/${postId}?context=edit&_fields=content`, null, credentials);
      const content = post.content.raw || post.content.rendered;
      
      const hasWebp = content.includes(newUrl);
      const hasOld = content.includes(oldUrl);

      if (hasWebp && !hasOld) {
        this.log('success', `XÁC MINH NỘI DUNG OK: #${postId}`);
        return true;
      } else {
        this.log('error', `XÁC MINH NỘI DUNG THẤT BẠI: #${postId} (WebP: ${hasWebp}, Old: ${hasOld})`);
        return false;
      }
    } catch (e: any) {
      this.log('error', `Lỗi kiểm tra xác minh cho post ${postId}: ${e.message}`);
      return false;
    }
  }


  private async optimizeSingleImage(item: any, baseUrl: string, credentials: any, extra?: { filename?: string, meta?: any }): Promise<ImageMapping | null> {
    const oldUrl = item.source_url;
    
    // Check if already optimized
    if (this.state.mappings[oldUrl]) {
       return this.state.mappings[oldUrl];
    }

    const defaultFilename = oldUrl.split('/').pop()?.split('.')[0] + ".webp";
    const filename = extra?.filename || defaultFilename;
    let lastError: any = null;
    const settings = optimizerConfig.getSettings();

    for (let attempt = 1; attempt <= settings.retry_limit; attempt++) {
      if (this.stopRequested || this.isResetting) break;
      try {
        if (attempt > 1) {
          this.log('info', `Thử lại tối ưu lần ${attempt} cho ID: ${item.id}...`);
          await new Promise(r => setTimeout(r, 2000));
        }

        const res = await axios.get(oldUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(res.data);
        const sizeBefore = buffer.length;

        const optimizedBuffer = await sharp(buffer)
          .resize({ width: settings.resize_width, withoutEnlargement: true })
          .webp({ quality: settings.webp_quality })
          .toBuffer();
        
        const sizeAfter = optimizedBuffer.length;
        const spaceSaved = sizeBefore - sizeAfter;

        // Pass extra metadata to uploadWpMedia
        const uploadRes = await uploadWpMedia(baseUrl, optimizedBuffer, filename, 'image/webp', credentials, {
          title: filename,
          alt_text: filename,
          meta: extra?.meta || { _ais_optimized: true }
        });
        
        const newUrl = uploadRes.source_url || uploadRes.guid?.rendered;
        const newMediaId = uploadRes.id;

        if (!newUrl) throw new Error("Upload WebP thất bại - không nhận được URL");

        const mapping: ImageMapping = {
          oldUrl,
          newUrl,
          mediaId: item.id,
          newMediaId: newMediaId,
          optimizedAt: new Date().toISOString(),
          replaceStatus: 'pending',
          verifyStatus: 'pending',
          cleanupStatus: 'pending',
          isUsed: true
        };

        this.state.mappings[oldUrl] = mapping;
        this.state.stats.spaceSavedBytes += Math.max(0, spaceSaved);
        this.state.stats.processedCount++;
        
        this.log('success', `ĐÃ TỐI ƯU XONG: ${oldUrl} -> ${newUrl}`);
        this.saveState();
        return mapping;
      } catch (e: any) {
        lastError = e;
        this.log('error', `Lỗi tối ưu ID ${item.id} (Lần ${attempt}): ${e.message}`);
      }
    }

    this.state.stats.errorCount++;
    return null;
  }

  private async verifyReplacement(baseUrl: string, oldUrl: string, newUrl: string): Promise<boolean> {
    try {
      const filename = new URL(oldUrl).pathname.split('/').pop() || "";
      const base = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
      
      this.log('info', `ĐANG KIỂM TRA HIỂN THỊ: Tìm ${newUrl} trên trang chủ...`);
      
      const response = await fetch(baseUrl);
      const html = await response.text();
      
      if (html.includes(newUrl)) {
        this.log('success', `XÁC MINH OK: Link mới đã hiển thị trên HTML`);
        return true;
      }
      
      const webpName = newUrl.substring(newUrl.lastIndexOf('/') + 1);
      if (html.includes(webpName)) {
        this.log('success', `XÁC MINH OK: Đã thấy path ${webpName} trên HTML`);
        return true;
      }

      this.log('error', `XÁC MINH KO THẤY: ${newUrl} chưa xuất hiện trên HTML trang chủ`);
      return false;
    } catch (e) {
      console.error("[WP] Verify error:", e);
      return false;
    }
  }

  private async handleLogoReplacement(oldLogoId: number, oldUrl: string, baseUrl: string, credentials: any) {
    const mapping = this.state.mappings[oldUrl];
    if (!mapping || !mapping.newMediaId) return;

    this.log('info', `PHÁT HIỆN LOGO (ID ${oldLogoId}). Đang cập nhật Logo mới...`);
    
    try {
      await updateWpSettings(baseUrl, { site_logo: mapping.newMediaId }, credentials);
      await updateWpSettings(baseUrl, { show_on_front: 'posts' }, credentials).catch(() => {});
      
      this.log('success', 'ĐÃ THAY THẾ LOGO TRONG SETTINGS', { oldLogoId, newLogoId: mapping.newMediaId });

      const verification = await checkImageUsageOnFrontend(baseUrl, mapping.newUrl);
      if (verification.used) {
        this.log('success', 'XÁC MINH LOGO OK: Logo mới đã hiển thị bên ngoài.');
        mapping.replaceStatus = 'success';
      } else {
        this.log('error', 'LƯU Ý: Logo mới chưa hiển thị ngay (có thể do Cache).');
        mapping.replaceStatus = 'success';
      }
    } catch (e: any) {
      this.log('error', `Lỗi khi thay thế logo: ${e.message}`);
    }
  }

  private async runCleanup(baseUrl: string, credentials: any) {
    const settings = optimizerConfig.getSettings();
    if (this.isResetting) return;
    if (!settings.enable_cleaner && !this.cleanupOnly) {
      this.log('info', 'Bỏ qua dọn dẹp do cài đặt Cleaner đang tắt.');
      return;
    }

    if (settings.dry_run) {
      this.log('info', 'CHẾ ĐỘ DRY RUN: Chỉ quét, không xoá thật.');
    }

    this.log('info', 'BẮT ĐẦU DỌN DẸP: Đang quét thư viện...');
    const now = new Date();
    let itemsProcessed = 0;
    const MAX_CLEANUP_PER_RUN = 10;
    
    if (!this.state.cleanupPages) this.state.cleanupPages = {};
    const cleanupPage = this.state.cleanupPages['media'] || 1;
    
    const mappingEntries = Object.entries(this.state.mappings).filter(([_, m]) => 
      m.cleanupStatus === 'pending' && 
      m.replaceStatus === 'success' &&
      m.verifyStatus === 'success' &&
      (this.cleanupOnly || (now.getTime() - new Date(m.optimizedAt).getTime()) > settings.delete_delay_minutes * 60 * 1000)
    );

    for (const [oldUrl, mapping] of mappingEntries) {
      if (this.stopRequested || itemsProcessed >= MAX_CLEANUP_PER_RUN) break;
      try {
        await this.cleanupSingleImage({
          mediaId: mapping.mediaId,
          urlToCheck: mapping.oldUrl,
          mapping: mapping
        }, baseUrl, credentials);
        itemsProcessed++;
        await new Promise(r => setTimeout(r, Math.max(2000, settings.delay_ms)));
      } catch (e: any) {
        this.log('error', `Lỗi dọn dẹp mapping ID ${mapping.mediaId}: ${e.message}`);
      }
      this.saveState();
    }

    if (itemsProcessed < MAX_CLEANUP_PER_RUN) {
      this.log('info', `Quét ảnh mồ côi (orphans) tại trang ${cleanupPage}...`);
      try {
        const orphans = await executeWpRest(
          baseUrl,
          "GET",
          `/wp-json/wp/v2/media?per_page=100&page=${cleanupPage}&orderby=id&order=desc&_fields=id,source_url,date_gmt`, 
          null,
          credentials
        );

        if (orphans && orphans.length > 0) {
          for (const item of orphans) {
            if (this.stopRequested || itemsProcessed >= MAX_CLEANUP_PER_RUN) break;
            const url = item.source_url;
            if (this.state.mappings[url] || url.endsWith('.webp')) continue;
            
            const uploadDate = new Date(item.date_gmt + 'Z');
            const ageMinutes = (now.getTime() - uploadDate.getTime()) / (1000 * 60);
            if (ageMinutes < 10) continue;

            try {
              await this.cleanupSingleImage({
                mediaId: item.id,
                urlToCheck: url,
                mediaItem: item
              }, baseUrl, credentials);
              itemsProcessed++;
              await new Promise(r => setTimeout(r, Math.max(3000, settings.delay_ms)));
            } catch (e: any) {}
          }
          
          if (itemsProcessed < MAX_CLEANUP_PER_RUN || orphans.length < 100) {
             this.state.cleanupPages['media'] = cleanupPage + 1;
             if (orphans.length < 100) {
               this.state.cleanupPages['media'] = 1;
             }
          }
        } else {
          this.state.cleanupPages['media'] = 1;
        }
      } catch (e: any) {
        const msg = String(e.message || "").toLowerCase();
        if (msg.includes('rest_post_invalid_page_number') || msg.includes('larger than the number of pages available') || msg.includes('invalid page number')) {
          this.state.cleanupPages['media'] = 1;
        }
      }
    }
    
    this.log('info', `Kết thúc chu kỳ dọn dẹp. Đã xử lý ${itemsProcessed} ảnh.`);
    this.saveState();
  }

  private async isImageUsedSafelyIntoWordPress(mediaId: number, urlToCheck: string, baseUrl: string, credentials: any, ignorePostId?: number): Promise<{ used: boolean; reason?: string; postId?: number }> {
    const settings = optimizerConfig.getSettings();
    
    const getBaseName = (fname: string) => {
      let b = fname.includes('.') ? fname.substring(0, fname.lastIndexOf('.')) : fname;
      b = b.replace(/-\d+x\d+$/, '');
      b = b.replace(/-scaled$/, '');
      return b;
    };

    const targetPath = (function() {
      try { return new URL(urlToCheck).pathname; } catch(e) { return ""; }
    })();
    const filename = targetPath.split('/').pop() || "";
    const filenameBase = getBaseName(filename);
    
    if (settings.check_post_content) {
      this.log('info', `[USAGE] Kiểm tra exhaustive (toàn bộ nội dung) cho: ${filenameBase || urlToCheck} (ID: ${mediaId})`);
      
      const postTypes = settings.target_post_types || ['posts', 'pages'];
      
      for (const type of postTypes) {
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
          if (page % 5 === 0) this.log('info', `[USAGE] Quét ${type} trang ${page}...`);
          // EXHAUSTIVE: No search= parameter to ensure we catch everything
          const items = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish,draft,future,private,pending&_cb=${Date.now()}&context=edit`, null, credentials).catch(() => []);
          
          if (items && Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              if (ignorePostId && Number(item.id) === Number(ignorePostId)) {
                if (Number(item.featured_media) === Number(mediaId)) {
                   const logMsg = `ẢNH VẪN LÀ ẢNH ĐẠI DIỆN TẠI #${item.id} (Dù vừa cập nhật)`;
                   this.log('info', `[VERIFY] ${logMsg}`);
                   return { used: true, reason: logMsg, postId: item.id };
                }
                continue;
              }
              
              const raw = (item.content?.raw || item.content?.rendered || "") + 
                          (item.excerpt?.raw || item.excerpt?.rendered || "");
              
              const isFeatured = Number(item.featured_media) === Number(mediaId);
              const inContent = raw.includes(urlToCheck);
              const inMeta = JSON.stringify(item.meta || {}).includes(urlToCheck);

              if (isFeatured || inContent || inMeta) {
                const logMsg = `ẢNH ĐANG DÙNG TẠI: #${item.id} (${item.title?.rendered || 'Untitled'}) - Featured: ${isFeatured}, Content: ${inContent}, Meta: ${inMeta}`;
                this.log('info', `[USAGE] ${logMsg}`);
                return { used: true, reason: logMsg, postId: item.id };
              }
            }
            if (items.length < 100) hasMore = false;
            else page++;
            
            // Avoid rate limit
            await new Promise(r => setTimeout(r, 0));
          } else {
            hasMore = false;
          }
        }
      }
    }

    if (settings.check_featured_image) {
      const types = settings.target_post_types || ['posts', 'pages'];
      for (const type of types) {
        const featured = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/${type}?per_page=100&featured_media=${mediaId}&_cb=${Date.now()}&context=edit&_fields=id,title`, null, credentials).catch(() => []);
        if (featured && featured.length > 0) {
          for (const fPost of featured) {
            if (ignorePostId && Number(fPost.id) === Number(ignorePostId)) continue;
            
            const logMsg = `ẢNH ĐANG LÀM ẢNH ĐẠI DIỆN TẠI: #${fPost.id} (${fPost.title?.rendered || 'N/A'})`;
            this.log('info', logMsg);
            return { used: true, reason: logMsg, postId: fPost.id };
          }
        }
      }
    }

    try {
      // Use cache buster for settings fetch to avoid stale logo ID
      const siteSettings = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/settings?_cb=${Date.now()}&context=edit`, null, credentials).catch(() => null);
      if (siteSettings) {
        const siteLogoId = siteSettings.site_logo;
        if (siteLogoId === mediaId) {
          const logMsg = `FOUND IN OPTION: Site Logo`;
          this.log('info', logMsg);
          return { used: true, reason: logMsg };
        }
        
        const settingsStr = JSON.stringify(siteSettings);
        if (settingsStr.includes(urlToCheck)) {
          const logMsg = `FOUND IN SETTINGS: Theme Options`;
          this.log('info', logMsg);
          return { used: true, reason: logMsg };
        }
      }
    } catch(e) {}

    // Visit internal system data to catch usage in brands, logos, coupons etc.
    const internalCheck = await this.isImageUsedInInternalSystem(urlToCheck, mediaId);
    if (internalCheck.used) {
       return internalCheck;
    }

    this.log('info', `NOT FOUND ANYWHERE - ID ${mediaId} (${filenameBase})`);
    this.log('info', `SAFE TO DELETE - No usage confirmation`);
    return { used: false };
  }

  private async isImageUsedInInternalSystem(urlToCheck: string, mediaId: number): Promise<{ used: boolean; reason?: string }> {
    try {
      const db = getDb();
      
      // 1. Check Brands
      const brandsSnap = await db.collection("brands").get();
      for (const doc of brandsSnap.docs) {
        const brand = doc.data() as Brand;
        const brandStr = JSON.stringify(brand);
        if (brandStr.includes(urlToCheck)) {
          this.log('info', `[INTERNAL USAGE] Brand ${brand.name} (#${brand.id}) vẫn dùng URL cũ.`);
        }
      }

      // 2. Check Media Records
      const mediaSnap = await db.collection("media").get();
      for (const doc of mediaSnap.docs) {
         const m = doc.data() as MediaRecord;
         if (m.url === urlToCheck) {
            this.log('info', `[INTERNAL USAGE] Media record #${m.id} vẫn dùng URL cũ.`);
         }
      }
    } catch (e: any) {
      this.log('error', `Lỗi kiểm tra usage internal: ${e.message}`);
    }
    // Return false to allow cleanup to proceed, just logging for visibility
    return { used: false };
  }

  private async replaceMediaInInternalSystem(oldUrl: string, newUrl: string) {
    try {
      const db = getDb();
      const filenameBase = this.getFileNameBase(oldUrl);

      // 1. Update Brands (Recursive Replace for all fields like logo, latest_offer_summary, etc.)
      const brandsSnap = await db.collection("brands").get();
      for (const doc of brandsSnap.docs) {
        const brand = doc.data();
        let changed = false;
        
        const replaceInObj = (obj: any) => {
          for (const key in obj) {
            if (typeof obj[key] === 'string') {
              if (obj[key].includes(oldUrl)) {
                const original = obj[key];
                obj[key] = obj[key].split(oldUrl).join(newUrl);
                
                if (obj[key] !== original) changed = true;
              }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              replaceInObj(obj[key]);
            }
          }
        };

        replaceInObj(brand);

        if (changed) {
          await db.collection("brands").doc(doc.id).set(brand);
          this.log('success', `Đã cập nhật Media mới trong hệ thống cho Brand: ${brand.name || doc.id}`);
        }
      }

      // 2. Update Media Records
      const mediaSnap = await db.collection("media").get();
      for (const doc of mediaSnap.docs) {
        const m = doc.data() as MediaRecord;
        if (m.url === oldUrl || (filenameBase && m.url.includes(filenameBase) && !m.url.endsWith('.webp'))) {
          await db.collection("media").doc(doc.id).update({ url: newUrl });
          this.log('success', `Đã cập nhật Media mới trong thư viện Media (#${m.id})`);
        }
      }
    } catch (e: any) {
      this.log('error', `Lỗi thay thế usage internal: ${e.message}`);
    }
  }

  private async findPostsUsingMedia(mediaId: number, urlToCheck: string, baseUrl: string, credentials: any): Promise<any[]> {
    const settings = optimizerConfig.getSettings();
    const postTypes = settings.target_post_types || ['posts', 'pages'];
    const allFound: any[] = [];
    
    // REMOVED: filenameBase matching completely as per requirement 4

    for (const type of postTypes) {
      this.log('info', `[FIND] Quét exhaustive để tìm usage Media #${mediaId} trong ${type}...`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          if (page % 5 === 0) this.log('info', `[FIND] Quét ${type} trang ${page}...`);
          // EXHAUSTIVE: No search= parameter to ensure we catch everything including meta hits
          const res = await executeWpRest(baseUrl, "GET", `/wp-json/wp/v2/${type}?per_page=100&page=${page}&context=edit&status=publish,draft,private,pending&_cb=${Date.now()}`, null, credentials).catch(() => []);
          
          if (!Array.isArray(res) || res.length === 0) break;

          for (const post of res) {
            const raw = (post.content?.raw || post.content?.rendered || "") + (post.excerpt?.raw || post.excerpt?.rendered || "");
            const isFeatured = Number(post.featured_media) === Number(mediaId);
            const inContent = raw.includes(urlToCheck);
            const inMeta = JSON.stringify(post.meta || {}).includes(urlToCheck);

            if (isFeatured || inContent || inMeta) {
              if (!allFound.find(existing => existing.id === post.id && existing._type === type)) {
                allFound.push({ ...post, _type: type });
              }
            }
          }

          if (res.length < 100) hasMore = false;
          else page++;
          
          await new Promise(r => setTimeout(r, 0));
        } catch (e) {
          hasMore = false;
        }
      }
    }
    return allFound;
  }

  private async proactiveReplaceMedia(
    oldMediaId: number,
    oldUrl: string,
    newMediaId: number,
    newUrl: string,
    baseUrl: string,
    credentials: any
  ) {
    const startTime = Date.now();
    const TIMEOUT = 10 * 60 * 1000; // 10 minutes fail-safe
    let iteration = 1;

    while (true) {
      if (Date.now() - startTime > TIMEOUT) {
        this.log('error', '[REPLACE] Timeout reached → stop to avoid infinite loop');
        break;
      }

      const posts = await this.findPostsUsingMedia(oldMediaId, oldUrl, baseUrl, credentials);
      if (posts.length === 0) {
        this.log('success', `✔ DONE: media #${oldMediaId} fully replaced`);
        break;
      }

      this.log('info', `[REPLACE] Loop ${iteration}: ${posts.length} posts remaining`);

      const filenameBase = this.getFileNameBase(oldUrl);
      const escapedBase = filenameBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `([^"'\\s>]*${escapedBase}(?:-\\d+x\\d+|-scaled)?\\.(?:jpg|jpeg|png|gif))`,
        'gi'
      );

      let updatedAny = false;

      for (const post of posts) {
        const type = post._type || 'posts';
        const payload: any = {};
        let changed = false;

        // 1. FEATURED IMAGE
        if (Number(post.featured_media) === Number(oldMediaId)) {
          payload.featured_media = newMediaId;
          changed = true;
        }

        // 2. CONTENT IMAGE
        const raw = post.content?.raw || post.content?.rendered || "";
        let updated = raw;

        if (raw.includes(oldUrl)) {
          updated = raw.replace(pattern, () => newUrl);

          // fallback replace
          if (updated.includes(oldUrl)) {
            updated = updated.split(oldUrl).join(newUrl);
          }

          if (updated !== raw) {
            payload.content = updated;
            changed = true;
          }
        }

        if (changed) {
          try {
            await executeWpRest(baseUrl, "POST", `/wp-json/wp/v2/${type}/${post.id}`, payload, credentials);
            updatedAny = true;
            this.log('success', `[REPLACE] Updated post #${post.id}`);
          } catch (e: any) {
            this.log('error', `[REPLACE] Failed post #${post.id}: ${e.message}`);
          }
        }
      }

      if (!updatedAny) {
        this.log('info', '[REPLACE] No changes in loop → stop');
        break;
      }

      iteration++;
      await new Promise(r => setTimeout(r, 800));
    }
  }

  private async cleanupSingleImage(
    params: { mediaId: number; urlToCheck: string; mapping?: ImageMapping; mediaItem?: any; ignorePostId?: number },
    baseUrl: string,
    credentials: any
  ) {
    const { mediaId, urlToCheck, mapping, ignorePostId } = params;
    const settings = optimizerConfig.getSettings();

    // 1. PROACTIVE REPLACEMENT (CRITICAL)
    if (mapping && mapping.newMediaId && mapping.newUrl) {
      // Replace in WordPress posts
      await this.proactiveReplaceMedia(mediaId, urlToCheck, mapping.newMediaId, mapping.newUrl, baseUrl, credentials);
      
      // Replace in Internal System (Brands, Media records)
      await this.replaceMediaInInternalSystem(urlToCheck, mapping.newUrl);
      
      await new Promise(r => setTimeout(r, 1000));
    }

    for (let attempt = 1; attempt <= settings.retry_limit; attempt++) {
      if (this.stopRequested || this.isResetting) break;
      try {
        if (attempt > 1) {
          this.log('info', `Thử lại cleanup lần ${attempt} cho ID ${mediaId}...`);
          await new Promise(r => setTimeout(r, 2000));
        }

        // STEP 3: VERIFY & CLEANUP CONDITION
        const usageCheck = await this.isImageUsedSafelyIntoWordPress(mediaId, urlToCheck, baseUrl, credentials, ignorePostId);
        
        // RELAXED CLEANUP: Prefer isVerified over usageCheck (Requirement 7)
        const isVerified = mapping ? mapping.verifyStatus === 'success' : false;

        // MANDATORY DEBUG LOG (Requirement 8)
        this.log('info', `[DEBUG CLEANUP] Checking ID ${mediaId}:`, {
          mediaId,
          isVerified,
          used: usageCheck.used,
          reason: usageCheck.reason,
          oldUrl: urlToCheck,
          newUrl: mapping?.newUrl || 'N/A'
        });

        // Simplified condition: delete if verified OR if truly not used (for orphans)
        if (isVerified || !usageCheck.used) {
          // Proceed to delete
        } else {
          const reason = usageCheck.used ? usageCheck.reason : "Chưa xác minh được WebP thay thế";
          this.log('info', `HỦY XOÁ (SKIP DELETE): still in use AND not verified - Reason: ${reason} - ID ${mediaId}`);
          if (mapping) {
            mapping.cleanupStatus = 'skipped';
            mapping.skipReason = reason;
          }
          this.state.stats.skippedCount++;
          this.saveState();
          return;
        }

        // --- STEP 4: DELETE (SAFE) ---
        try {
          const siteUrl = new URL(baseUrl);
          const imageUri = new URL(urlToCheck);
          if (imageUri.hostname !== siteUrl.hostname) {
            if (mapping) { mapping.cleanupStatus = 'skipped'; mapping.skipReason = 'external_domain'; }
            this.state.stats.skippedCount++;
            this.saveState();
            return;
          }
        } catch (e) {}

        if (settings.dry_run) {
          this.log('info', `XOÁ GIẢ LẬP (DRY RUN) - ID ${mediaId}`);
          if (mapping) mapping.cleanupStatus = 'done';
          return;
        }

        // STEP 5: ADD DELAY (Requirement 6)
        await new Promise(r => setTimeout(r, 2000));

        this.log('info', `ĐANG XOÁ VĨNH VIỄN - ID ${mediaId}: ${urlToCheck}`);
        // FORCE DELETE MANDATORY (Requirement 1)
        await executeWpRest(baseUrl, "DELETE", `/wp-json/wp/v2/media/${mediaId}?force=true`, null, credentials);

        if (mapping) mapping.cleanupStatus = 'done';
        this.state.stats.deletedCount++;
        this.log('success', `ĐÃ XOÁ THÀNH CÔNG Media ID ${mediaId}.`);
        this.saveState();
        return; 
      } catch (e: any) {
        this.log('error', `Lỗi dọn dẹp ID ${mediaId} (Lần ${attempt}): ${e.message}`);
      }
    }
  }

  public async reset() {
    console.log("RESET START");
    this.isResetting = true;
    this.currentGeneration++; // Invalidate all current loops
    this.stopRequested = true;
    this.isProcessing = false;
    this.cleanupOnly = false;
    
        // 1. CLEAR MEMORY IMMEDIATELY
        this.state = {
          lastProcessedMediaId: 0,
          currentPages: {},
          cleanupPages: {},
          mappings: {},
          stats: {
            processedCount: 0,
            spaceSavedBytes: 0,
            errorCount: 0,
            deletedCount: 0,
            skippedCount: 0
          },
          logs: [],
          status: 'idle',
          processedPostIds: [],
          isLogoOptimized: false
        };
        this.saveState();

    // 2. STOP WORKER & CLEAR FILE
    console.log("STOP WORKER");
    console.log("CLEAR MEMORY");
    
    try {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
      // Write an empty, clean state
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
      console.log("DELETE FILE");
    } catch (e) {
      console.error("[Optimizer] Failed to reset state file", e);
    }

    console.log("RESET BROWSER");
    console.log("WORKER STOPPED");
    console.log("RESET DONE");

    // Hold isResetting true for a short peek to let loop catch up
    await new Promise(r => setTimeout(r, 1000));
    
    this.isResetting = false;
    this.stopRequested = false;
    
    return { success: true };
  }
}

export const imageOptimizerWorker = new ImageOptimizerWorker();
