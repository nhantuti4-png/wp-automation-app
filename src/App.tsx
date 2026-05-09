/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Tag, 
  Settings as SettingsIcon, 
  History, 
  Plus, 
  Save, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  ExternalLink,
  Loader2,
  ChevronRight,
  TrendingDown,
  Globe,
  Link2,
  Image as ImageIcon,
  Upload,
  Search,
  Brain,
  Cloud
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Brand, WPSettings, ActivityLog, ContentTask, MediaRecord, ImageSourceType } from "./types.ts";
import { brandService, settingsService, strategyService, wpService, mediaService, memoryService } from "./services/api.ts";
import { geminiService } from "./services/gemini.ts";
import { validateContent, validateBrandMatch, resolvePlaceholders } from "./lib/renderUtils.ts";
import { fetchAndOptimizeImage, OptimizationResult } from "./lib/imageOptimizer.ts";
import { selectImagesByPattern } from "./lib/imageSelection.ts";

import { ImageOptimizerDashboard } from "./components/ImageOptimizerDashboard.tsx";
import { OptimizerSettingsUI } from "./components/OptimizerSettings.tsx";
import { CouponFetcherDashboard } from "./components/CouponFetcherDashboard.tsx";
import { AITrainingSettings } from "./components/AITrainingSettings.tsx";
import { CloudSyncUI } from "./components/CloudSyncUI.tsx";

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
      active ? "bg-orange-500 text-white shadow-lg shadow-orange-200" : "text-gray-500 hover:bg-gray-100"
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, variant = "primary", className = "", loading = false, disabled = false, ...props }: any) => {
  const variants: any = {
    primary: "bg-orange-500 text-white hover:bg-orange-600 shadow-orange-100",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-red-100",
  };

  return (
    <button
      disabled={loading || disabled}
      className={`relative px-4 py-2 rounded-xl font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : children}
    </button>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [preselectedTask, setPreselectedTask] = useState<any>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [settings, setSettings] = useState<WPSettings | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      console.log("[App] Starting data load...");
      let b = await brandService.getAll();
      let s = await settingsService.get();
      const l = await strategyService.getLogs();
      const c = await settingsService.getCategories();
      
      // PERSISTENCE RESCUE: If server is empty, try to restore from browser backup
      const needsBrandRescue = !b || b.length === 0;
      const needsSettingsRescue = !s || Object.keys(s || {}).length === 0 || !s?.baseUrl;

      if (needsBrandRescue || needsSettingsRescue) {
        console.log("[Rescue] Server data missing. Attempting restoration from browser storage...");
        let restored = false;
        
        if (needsBrandRescue) {
          const ok = await brandService.restoreFromRescue();
          if (ok) restored = true;
        }
        
        if (needsSettingsRescue) {
          const ok = await settingsService.restoreFromRescue();
          if (ok) restored = true;
        }

        // Also try to restore memories if brands were missing (likely first boot after container reset)
        if (needsBrandRescue) {
          await memoryService.restore();
        }

        if (restored) {
          console.log("[Rescue] Restoration successful. Reloading data...");
          b = await brandService.getAll();
          s = await settingsService.get();
        }
      }

      setBrands(Array.isArray(b) ? b : []);
      setSettings(s || null);
      setLogs(l || []);
      setCategories(c || []);
    } catch (err: any) {
      console.error("[App] Load failed:", err);
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedBrandId(null);
  };

  return (
    <div className="flex min-h-screen bg-[#FDFCFB] text-gray-900 font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-100 p-6 flex flex-col gap-8 bg-white/50 backdrop-blur-sm sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-2">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
            <TrendingDown size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">CouponBlog</h1>
            <p className="text-[10px] uppercase tracking-widest text-orange-500 font-bold">Auto Publisher</p>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Bảng điều khiển" 
            active={activeTab === "dashboard"} 
            onClick={() => handleTabChange("dashboard")} 
          />
          <SidebarItem 
            icon={Tag} 
            label="Thương hiệu" 
            active={activeTab === "brands"} 
            onClick={() => handleTabChange("brands")} 
          />
          <SidebarItem 
            icon={History} 
            label="Lịch sử" 
            active={activeTab === "history"} 
            onClick={() => handleTabChange("history")} 
          />
          <SidebarItem 
            icon={ImageIcon} 
            label="Thư viện ảnh" 
            active={activeTab === "media"} 
            onClick={() => handleTabChange("media")} 
          />
          <SidebarItem 
            icon={RefreshCw} 
            label="Tối ưu ảnh" 
            active={activeTab === "optimizer"} 
            onClick={() => handleTabChange("optimizer")} 
          />
          <SidebarItem 
            icon={Search} 
            label="Auto Coupon" 
            active={activeTab === "coupoons"} 
            onClick={() => handleTabChange("coupoons")} 
          />
          <SidebarItem 
            icon={Brain} 
            label="Adaptive AI" 
            active={activeTab === "ai-agent"} 
            onClick={() => handleTabChange("ai-agent")} 
          />
          <SidebarItem 
            icon={SettingsIcon} 
            label="Cài đặt" 
            active={activeTab === "settings"} 
            onClick={() => handleTabChange("settings")} 
          />
          <SidebarItem 
            icon={Cloud} 
            label="Lưu trữ Cloud" 
            active={activeTab === "sync"} 
            onClick={() => handleTabChange("sync")} 
          />
        </nav>

        <div className="mt-auto">
          <Card className={`p-4 border-2 transition-all ${
            !settings?.baseUrl ? 'bg-red-50 border-red-100' : 
            settings?.status === 'verified' ? 'bg-green-50 border-green-200 shadow-sm' : 
            'bg-orange-50 border-orange-100'
          }`}>
            <h3 className={`font-bold text-sm mb-1 ${
              !settings?.baseUrl ? 'text-red-900' : 
              settings?.status === 'verified' ? 'text-green-900' : 
              'text-orange-900'
            }`}>WordPress STATUS</h3>
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                !settings?.baseUrl ? 'bg-red-500 animate-pulse' : 
                settings?.status === 'verified' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                'bg-orange-500 animate-pulse'
              }`} />
              <span className={
                !settings?.baseUrl ? 'text-red-800' : 
                settings?.status === 'verified' ? 'text-green-800 font-bold' : 
                'text-red-800 font-medium'
              }>
                {!settings?.baseUrl ? 'Chưa thiết lập' : settings?.status === 'verified' ? 'Đã kết nối' : 'Đăng nhập thất bại'}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="animate-spin text-orange-500" size={48} />
            <p className="text-gray-400 animate-pulse font-medium">Đang kết nối hệ thống...</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {activeTab === "dashboard" && (
              <Dashboard 
                brands={brands} 
                settings={settings} 
                onPublishSuccess={loadAll} 
                preselectedTask={preselectedTask}
                onClearPreselected={() => setPreselectedTask(null)}
                onTabChange={setActiveTab}
              />
            )}
            {activeTab === "brands" && (
              selectedBrandId ? (
                <BrandDetail 
                  brandId={selectedBrandId} 
                  settings={settings}
                  onBack={() => setSelectedBrandId(null)} 
                  onUpdate={loadAll} 
                  onUseForBlog={(task) => {
                    setPreselectedTask(task);
                    setActiveTab("dashboard");
                    setSelectedBrandId(null);
                  }}
                />
              ) : (
                <BrandManager 
                  brands={brands} 
                  onUpdate={loadAll} 
                  onSelectBrand={setSelectedBrandId}
                />
              )
            )}
            {activeTab === "settings" && (
              <SettingsPage 
                settings={settings} 
                categories={categories}
                onSave={loadAll} 
              />
            )}
            {activeTab === "history" && (
              <HistoryPage logs={logs} />
            )}
            {activeTab === "media" && (
              <MediaLibrary brands={brands} />
            )}
            {activeTab === "optimizer" && (
              <ImageOptimizerDashboard />
            )}
            {activeTab === "optimizer-settings" && (
              <OptimizerSettingsUI />
            )}
            {activeTab === "coupoons" && (
              <CouponFetcherDashboard />
            )}
            {activeTab === "ai-agent" && (
              <AITrainingSettings />
            )}
            {activeTab === "sync" && (
              <CloudSyncUI />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// --- Sub-pages ---

function Dashboard({ brands, settings, onPublishSuccess, preselectedTask, onClearPreselected, onTabChange }: any) {
  const [task, setTask] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [article, setArticle] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [featuredImage, setFeaturedImage] = useState<{ url: string; sourceType: string } | null>(null);
  const [featuredMediaId, setFeaturedMediaId] = useState<number | undefined>(undefined);
  const [uploadedMediaIds, setUploadedMediaIds] = useState<number[]>([]);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [ctaAudit, setCtaAudit] = useState<any[]>([]);
  const [lastImageUsage, setLastImageUsage] = useState<Record<string, { pattern: string, featuredUrl: string, usedUrls: string[] }>>({});

  useEffect(() => {
    if (preselectedTask) {
      setTask(preselectedTask);
      setMode('manual');
      onClearPreselected();
    } else {
      fetchNextTask();
    }
  }, [preselectedTask]);

  const fetchNextTask = async () => {
    try {
      const t = await strategyService.getNext();
      setTask(t);
      setArticle(null);
      setFeaturedImage(null);
      setFeaturedMediaId(undefined);
      setUploadedMediaIds([]);
      setCtaAudit([]);
      setError("");
      
      const img = await mediaService.suggest(t.brand.id, t.brand.niche, t.type);
      setFeaturedImage(img);
    } catch (err: any) {
      setError(err.response?.data?.error || "Lỗi khi lấy nhiệm vụ");
    }
  };

  const handleManualSelect = async (brandId: string) => {
    try {
      setGenerating(true);
      const t = await strategyService.getManualTask(brandId, 'Review');
      setTask(t);
      setArticle(null);
      setFeaturedImage(null);
      setFeaturedMediaId(undefined);
      setUploadedMediaIds([]);
      setCtaAudit([]);
      setError("");
      
      const img = await mediaService.suggest(t.brand.id, t.brand.niche, t.type);
      setFeaturedImage(img);
    } catch (err: any) {
      setError("Lỗi khi chọn thương hiệu thủ công");
    } finally {
      setGenerating(false);
    }
  };

  const handleTypeChange = async (type: string) => {
    if (!task?.brand?.id) return;
    try {
      setGenerating(true);
      const t = await strategyService.getManualTask(task.brand.id, type);
      setTask(t);
      // We don't necessarily need to reset article/images here, 
      // but maybe better for consistency
      setArticle(null);
      setError("");
    } catch (err) {
      setError("Lỗi khi đổi loại bài viết");
    } finally {
      setGenerating(false);
    }
  };

  const generate = async () => {
    if (!task) return;
    setGenerating(true);
    setError("");
    try {
      // Phase 1: Parallelize Discovery
      const scanPromise = brandService.scan(task.brand.id);
      
      // Wait for scan to complete as it provides the context and image sources
      const scanResult = await scanPromise;
      
      const imageSources = scanResult.detectedImages || [];
      const usage = lastImageUsage[task.brand.id] || { pattern: "", featuredUrl: "", usedUrls: [] };
      const selection = selectImagesByPattern(imageSources, task.brand, usage.pattern, usage.usedUrls);
      
      // Update usage history
      const newUsedList = Array.from(new Set([
        ...usage.usedUrls,
        selection.featured,
        selection.inline_1,
        selection.inline_2,
        selection.inline_3,
        selection.inline_4
      ])).slice(-50);

      setLastImageUsage(prev => ({
        ...prev,
        [task.brand.id]: { 
            pattern: selection.pattern, 
            featuredUrl: selection.featured,
            usedUrls: newUsedList
        }
      }));

      // Phase 2: STRICT SEQUENTIAL PIPELINE (Stability & Correctness)
      const roles = ['featured', 'inline_1', 'inline_2', 'inline_3', 'inline_4'] as const;
      const pipeline: Record<string, { source: string; url: string; id?: number }> = {
        featured: { source: selection.featured, url: "" },
        inline_1: { source: selection.inline_1, url: "" },
        inline_2: { source: selection.inline_2, url: "" },
        inline_3: { source: selection.inline_3, url: "" },
        inline_4: { source: selection.inline_4, url: "" }
      };

      const auditLogs: any[] = [];
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // 1. GENERATE AI CONTENT FIRST (Placeholder Phase)
      console.log(`[AI] Generating content draft for ${task.brand.name}...`);
      const inlinePlaceholders = ["[[INLINE_IMAGE_1]]", "[[INLINE_IMAGE_2]]", "[[INLINE_IMAGE_3]]", "[[INLINE_IMAGE_4]]"];
      const draftArt = await geminiService.generateArticle(
        task.brand, 
        task.type, 
        task.niche, 
        task.patterns, 
        scanResult.sourceContext, 
        settings?.geminiApiKey,
        inlinePlaceholders
      );

      // 2. IMAGE PIPELINE (Sequential Anti-SPAM)
      console.log(`[IMG] Starting sequential image process for ${task.brand.name}`);
      const mediaIds: number[] = [];
      for (const role of roles) {
        const source = pipeline[role].source;
        if (!source) continue;

        try {
          console.log(`[IMG] Processing ${role}...`);
          const targetWidth = role === 'featured' ? 1600 : 800;
          const opt = await fetchAndOptimizeImage(source, targetWidth, 0.82);
          
          const filename = `${task.brand.slug}-${role}-${Date.now()}.jpg`;
          const base64Data = opt.dataUrl.split(',')[1];
          const uploaded = await wpService.upload(base64Data, filename);
          
          const finalUrl = uploaded.source_url || uploaded.guid?.rendered || "";
          if (!finalUrl) throw new Error("Upload succeeded but no URL returned from WP.");

          pipeline[role].url = finalUrl;
          pipeline[role].id = uploaded.id;
          
          if (uploaded.id) {
            mediaIds.push(uploaded.id);
          }

          if (role === 'featured' && uploaded.id) {
            setFeaturedMediaId(uploaded.id);
          }

          auditLogs.push({
            role: role.toUpperCase(),
            originalSize: `${Math.round(opt.originalSize / 1024)}KB`,
            optimizedSize: `${Math.round(opt.optimizedSize / 1024)}KB`,
            status: 'success',
            url: finalUrl
          });

          // Anti-spam delay
          await sleep(Math.floor(Math.random() * (1200 - 700 + 1) + 700));

        } catch (e: any) {
          const serverError = e.response?.data?.error || e.response?.data?.message || e.message;
          console.error(`[IMG] Skip ${role}:`, serverError);
          pipeline[role].url = ""; 
          auditLogs.push({ role: role.toUpperCase(), status: 'failed', error: String(serverError) });
        }
      }

      // 3. PLACEHOLDER REPLACEMENT & HARD SANITIZE
      console.log(`[PIPELINE] Resolving placeholders for ${task.brand.name}`);
      let finalContent = draftArt.content;

      inlinePlaceholders.forEach((placeholder, index) => {
        const role = `inline_${index + 1}` as const;
        const url = pipeline[role].url;
        
        if (url) {
          // Construct HTML <img> with requested styling
          const imgHtml = `\n<img src="${url}" alt="${task.brand.name} feature ${index + 1}" loading="lazy" style="max-width:600px;width:100%;margin:32px auto;display:block;border-radius:8px;" />\n`;
          finalContent = finalContent.split(placeholder).join(imgHtml); // Global replacement
        } else {
          finalContent = finalContent.split(placeholder).join(""); // Hard removal of failed image markers
        }
      });

      // Global safety clean - ensure NO leaked tokens survive
      finalContent = finalContent.replace(/\[\[.*?\]\]/g, "");
      finalContent = finalContent.replace(/\$\{.*?\}/g, "");
      finalContent = finalContent.replace(/\{\{.*?\}\}/g, "");
      
      // 4. FINAL VALIDATION (CRITICAL CHECK)
      if (finalContent.includes("[[")) {
        throw new Error("STABILITY ERROR: Unresolved image placeholders would be visible to users.");
      }
      
      const containsBrokenImage = finalContent.includes('src=""') || finalContent.includes('src="undefined"');
      if (containsBrokenImage) {
        throw new Error("STABILITY ERROR: Broken image tags detected (missing source).");
      }

      const art = { ...draftArt, content: finalContent };

      console.group(`--- Pipeline Audit: ${task.brand.name} ---`);
      console.table(auditLogs);
      console.groupEnd();

      setUploadedMediaIds(mediaIds);

      if (pipeline.featured.url) {
        setFeaturedImage({
          id: 'wp-' + (pipeline.featured.id || Date.now()),
          url: pipeline.featured.url,
          sourceType: 'brand image',
          brandId: task.brand.id,
          createdAt: new Date().toISOString()
        } as any);
      }
      
      await strategyService.addLog({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brandName: task.brand.name,
        type: 'generate',
        title: `Pipeline hoàn tất cho ${task.brand.name}`,
        details: `Crawl: ${imageSources.length} ảnh. Pattern: ${selection.pattern}. Thành công: ${auditLogs.filter(a => a.status === 'success').length}/${roles.length}`,
        status: 'success'
      });

      setArticle(art);
      
      await strategyService.trackHistory({
        brandId: task.brand.id,
        articleType: task.type,
        formId: task.patterns.formId,
        titleIndex: task.patterns.titleIndex,
        introIndex: task.patterns.introIndex,
        toneIndex: task.patterns.toneIndex,
        ctaIndex: task.patterns.ctaIndex
      });
      
      // --- CTA DEBUGGING LOGIC ---
      const parser = new DOMParser();
      const doc = parser.parseFromString(art.content, 'text/html');
      const links = Array.from(doc.querySelectorAll('a'));
      const ctas = links.map((link, idx) => {
        const href = link.getAttribute('href') || "";
        const text = link.textContent || "";
        const outerHtml = link.outerHTML;
        let intentType = "other";
        let sourceField = "unknown";
        
        const isAff1 = task.brand.affiliate_link_1 && href === task.brand.affiliate_link_1;
        const isAff2 = task.brand.affiliate_link_2 && href === task.brand.affiliate_link_2;
        const isCoupon = href.includes('/coupon/') || (task.brand.coupon_page_url && href === task.brand.coupon_page_url);
        const isSale = (task.brand.sale_url && href === task.brand.sale_url) || (task.brand.deals_url && href === task.brand.deals_url);

        if (isAff1 || isAff2) {
          intentType = "shopping";
          sourceField = isAff1 ? "affiliate_link_1" : "affiliate_link_2";
        }
        else if (isCoupon) {
          intentType = "coupon";
          sourceField = "coupon_page_url";
        }
        else if (isSale) {
          intentType = "sale";
          sourceField = task.brand.sale_url && href === task.brand.sale_url ? "sale_url" : "deals_url";
        }
        else if (href === task.brand.official_site) {
          intentType = "official";
          sourceField = "official_site";
        }
        
        const status = (href.includes('[[') || href.includes('${') || href === "" || href.includes('example.com')) ? 'fail' : 'pass';
        
        return { pos: idx + 1, text, intentType, href, sourceField, brand: task.brand.name, status, snippet: outerHtml };
      });

      console.group(`--- CTA Intent Audit: ${task.brand.name} ---`);
      console.table(ctas);
      console.log("Brand Links Config:", { 
        aff1: task.brand.affiliate_link_1, 
        aff2: task.brand.affiliate_link_2,
        coupon_page: task.brand.coupon_page_url,
        sale: task.brand.sale_url 
      });
      console.groupEnd();
      
      setCtaAudit(ctas);
      setArticle(art);
    } catch (err: any) {
      console.error("AI Generation failed:", err);
      setError(err.message || "AI tạo nội dung thất bại. Vui lòng thử lại.");
      await strategyService.addLog({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brandName: task.brand.name,
        type: 'generate',
        title: `Lỗi tạo bài viết cho ${task.brand.name}`,
        details: err.message || "Lỗi khi đọc nguồn hoặc tạo nội dung với AI",
        status: 'error'
      });
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (!article || !task) return;
    
    if (!settings || !settings.baseUrl) {
      setError("Bạn chưa cấu hình WordPress. Vui lòng vào mục Cài đặt.");
      return;
    }
    
    // VALIDATION: Chặn tuyệt đối nếu còn placeholder
    const allContent = article.title + " " + (article.excerpt || "") + " " + article.content + " " + article.slug;
    
    // VALIDATION: Chặn tuyệt đối nếu còn Base64
    if (allContent.includes("data:image/")) {
      setError("LỖI NGHIÊM TRỌNG (Base64 Leak): Phát hiện dữ liệu ảnh thô (Base64) trong bài viết. Vui lòng tạo lại bài.");
      return;
    }

    const placeholderError = validateContent(allContent);
    if (placeholderError) {
      setError(`LỖI NGHIÊM TRỌNG (Placeholder): ${placeholderError}. Vui lòng không đăng bản thô lên WordPress.`);
      return;
    }

    // VALIDATION: Chặn tuyệt đối nếu lệch brand
    const brandMismatchError = validateBrandMatch(allContent, task.brand.name);
    if (brandMismatchError) {
      setError(`LỖI NGHIÊM TRỌNG (Brand Mismatch): ${brandMismatchError}. Nội dung đang hiển thị có vẻ thuộc về thương hiệu khác.`);
      return;
    }

    // VALIDATION: Chặn tuyệt đối link rác/example
    if (allContent.includes("example.com")) {
      setError("LỖI NGHIÊM TRỌNG (Invalid Links): Phát hiện liên kết example.com trong bài viết. Vui lòng tạo lại bài.");
      return;
    }

    // VALIDATION: Chặn tuyệt đối token rò rỉ
    if (allContent.includes("[[")) {
      setError("LỖI NGHIÊM TRỌNG (Token Leak): Phát hiện token chưa được xử lý [[...]] trong bài viết. Vui lòng tạo lại bài.");
      return;
    }

    // VALIDATION: Chặn tuyệt đối ảnh lỗi
    if (allContent.includes('src=""') || allContent.includes('src="undefined"')) {
      setError("LỖI NGHIÊM TRỌNG (Broken Image): Phát hiện thẻ ảnh bị lỗi (thiếu nguồn). Vui lòng tạo lại bài.");
      return;
    }

    // VALIDATION: Chặn tuyệt đối nếu bài thiếu ảnh inline
    const inlineCount = (article.content.match(/<img/g) || []).length;
    if (inlineCount < 1) {
      setError(`LỖI NGHIÊM TRỌNG (Layout): Bài viết không có ảnh inline. Vui lòng tạo lại bài.`);
      return;
    }

    // VALIDATION: Chặn tuyệt đối nếu chưa có Featured Image gán trong WP (phải có Media ID)
    if (!featuredMediaId) {
      setError("LỖI NGHIÊM TRỌNG (Featured Image): Ảnh bìa chưa được gán thành công vào WordPress Media Library. Vui lòng tạo lại bài.");
      return;
    }

    setPublishing(true);
    setError("");
    try {
      console.log("--- PUBLISH PAYLOAD IDENTITY ---");
      console.log("Selected Brand ID:", task.brand.id);
      console.log("Selected Brand Name:", task.brand.name);
      console.log("Article Title:", article.title);
      console.log("Featured Media ID:", featuredMediaId);
      console.log("Featured Image Context:", featuredImage?.url);
      
      // 1. Tags Generation Logic (SEO & Brand-Focused)
      const brand = task.brand.name;
      const tagSet = new Set<string>();
      
      // Standalone Brand Tag (Primary)
      tagSet.add(brand);
      
      const combined = (article.title + " " + article.content).toLowerCase();
      const articleType = (task.type || "").toLowerCase();

      // Compound Tag 1: Intent based on Article Type
      if (articleType.includes('review') || articleType.includes('worth buying')) {
        tagSet.add(`${brand} Review`);
      } else if (articleType.includes('guide')) {
        tagSet.add(`${brand} Buying Guide`);
      } else if (articleType.includes('better than')) {
        tagSet.add(`${brand} Comparison`);
      }

      // Compound Tag 2: Intent based on Shopping Context
      if (combined.includes('coupon') || combined.includes('promo code') || combined.includes('mã giảm giá')) {
        tagSet.add(`${brand} Promo Codes`);
      } else if (combined.includes('sale') || combined.includes('deal') || combined.includes('discount') || combined.includes('giảm giá')) {
        tagSet.add(`${brand} Deals`);
      }

      // Optional Rule: Add Niche if space allows and it's not generic
      if (tagSet.size < 3 && task.niche && task.niche !== "Chung" && task.niche !== brand) {
        tagSet.add(task.niche);
      }

      const tagNames = Array.from(tagSet).slice(0, 4); // Limit to 4 tags
      console.log("SEO-Focused Tags Generated:", tagNames);

      // 2. Publish Content (Already contains real WP URLs)
      const res = await wpService.publish({
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        slug: article.slug,
        status: settings.postStatus || "draft",
        categories: [settings.defaultCategoryId],
        featured_media: featuredMediaId,
        tagNames: tagNames
      });

      console.log(`Publish Success! Post ID: ${res.id}, Tags: ${tagNames.join(', ')}`);

      // 3. Optional but requested: Set attachment.post_parent = post_id
      // This ensures images appear as "Attached" in Media Library and helps with cleanup
      try {
        console.log(`[WP] Attaching ${uploadedMediaIds.length} images to post ${res.id}...`);
        if (uploadedMediaIds.length > 0) {
          await Promise.all(uploadedMediaIds.map(id => wpService.updateMedia(id, { post: res.id })));
          console.log("REPLACE SUCCESS");
          console.log("POST UPDATED");
        }
      } catch (e) {
        console.warn("[WP] Failed to attach images to post (post_parent update failed)", e);
      }

      await strategyService.addLog({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brandName: task.brand.name,
        type: 'publish',
        title: `Đã đăng bài ${task.brand.name}`,
        details: article.title,
        wpPostId: res.id,
        wpUrl: res.link,
        status: "success"
      });

      await brandService.save({
          ...task.brand,
          use_count: task.brand.use_count + 1,
          last_used_at: new Date().toISOString()
      });

      onPublishSuccess();
      setArticle(null);
      if (mode === 'auto') fetchNextTask();
      alert("Đã đăng thành công dưới dạng " + settings.postStatus);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      setError("Đăng bài thất bại: " + msg);
      await strategyService.addLog({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brandName: task.brand?.name || "Unknown",
        type: 'publish',
        title: "Lỗi đăng bài WordPress",
        details: msg,
        status: "error",
        errorMessage: msg
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <header className="mb-10">
        <h2 className="text-3xl font-bold tracking-tight">Bảng điều khiển</h2>
        <p className="text-gray-500">Quản lý lịch trình tạo nội dung AI và xuất bản bài viết.</p>
      </header>

      <div className="grid grid-cols-3 gap-6 mb-10">
        <Card className="bg-orange-500 text-white">
          <p className="text-sm opacity-80 mb-1">Tổng Thương hiệu</p>
          <p className="text-3xl font-bold">{Array.isArray(brands) ? brands.length : 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Đang hoạt động</p>
          <p className="text-3xl font-bold">{(Array.isArray(brands) ? brands : []).filter((b: any) => b.status === 'active').length}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Sẵn sàng xuất bản</p>
          <p className={`text-3xl font-bold ${settings?.baseUrl ? 'text-green-500' : 'text-red-400'}`}>
            {settings?.baseUrl ? 'SẴN SÀNG' : 'CHƯA CẤU HÌNH'}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Nhiệm vụ nội dung</h3>
            <div className="flex bg-gray-100 p-1 rounded-lg shadow-inner">
              <button 
                onClick={() => setMode('auto')} 
                className={`px-3 py-1 text-xs font-extrabold rounded-md transition-all ${mode === 'auto' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400'}`}
              >
                Tự động
              </button>
              <button 
                onClick={() => setMode('manual')} 
                className={`px-3 py-1 text-xs font-extrabold rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400'}`}
              >
                Thủ công
              </button>
            </div>
          </div>

          {mode === 'manual' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">1. CHỌN THƯƠNG HIỆU</label>
                <select 
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium"
                  onChange={(e) => handleManualSelect(e.target.value)}
                  value={task?.brand?.id || ""}
                >
                  <option value="">-- Danh sách Brand --</option>
                  {(Array.isArray(brands) ? brands : []).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">2. LOẠI BÀI VIẾT</label>
                <select 
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium"
                  value={task?.type || ""}
                  onChange={(e) => handleTypeChange(e.target.value)}
                >
                  <option value="Review">Review Story (Style 3)</option>
                  <option value="Guide">Saving Guide</option>
                  <option value="Roundup">Product Roundup</option>
                  <option value="Seasonal">Seasonal Deal</option>
                  <option value="Comparison">Comparison</option>
                  <option value="Onboarding">New User Guide</option>
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-2 text-sm border border-red-100">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Lỗi xử lý</p>
                <p className="opacity-90">{error}</p>
                {error.includes("configured") && (
                   <button onClick={() => { onTabChange("settings"); setError(""); }} className="mt-2 text-xs font-bold underline">
                      Đi tới mục Cài đặt ngay
                   </button>
                )}
              </div>
            </div>
          )}

          {task ? (
            <div className="flex flex-col gap-4">
              {mode === 'auto' && (
                <div className="flex items-center gap-4 p-4 bg-orange-50/30 rounded-2xl relative overflow-hidden border border-orange-100/50">
                  <div className="absolute top-0 right-0 p-1 px-3 bg-orange-500 text-white font-bold text-[8px] uppercase tracking-widest rounded-bl-lg">Gợi ý AI</div>
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-orange-500 font-bold border border-gray-100 text-lg">
                    {task.brand.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800">{task.brand.name}</h4>
                    <p className="text-[10px] text-orange-500 uppercase font-bold tracking-wider">{task.brand.niche}</p>
                  </div>
                  <button onClick={fetchNextTask} className="ml-auto p-2 text-gray-400 hover:text-orange-500 transition-colors">
                    <RefreshCw size={18} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-tighter">THƯƠNG HIỆU HIỆN TẠI</p>
                  <p className="font-bold text-gray-700">{task.brand.name}</p>
                </div>
                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
                   <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-tighter">LOẠI BÀI VIẾT</p>
                   <p className="font-bold text-gray-700">{task.type}</p>
                </div>
              </div>

              <Button 
                onClick={generate} 
                loading={generating} 
                disabled={!task?.brand}
                className={`py-3 text-lg ${!settings?.baseUrl ? "opacity-90 grayscale-[0.3]" : ""}`}
              >
                Tạo bài viết với Gemini AI
              </Button>
              {!settings?.baseUrl && task?.brand && (
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-100 text-[11px] text-orange-800">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertCircle size={14} className="text-orange-500" />
                    Hệ thống chưa kết nối WordPress. Bạn vẫn có thể tạo bài nhưng không thể tự động tải ảnh & xuất bản.
                  </p>
                  <button onClick={() => onTabChange("settings")} className="mt-1 font-bold underline">Thiết lập ngay</button>
                </div>
              )}
            </div>
          ) : (
             <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
               Chọn thương hiệu hoặc bật chế độ Tự động
             </div>
          )}
        </Card>

        {article && (
          <Card className="flex flex-col gap-6 border-orange-200 bg-orange-50/20">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Xem trước bài viết</h3>
              <CheckCircle size={20} className="text-green-500" />
            </div>
            
            <div className="space-y-4">
              {featuredImage && (
                <div className="relative group aspect-video rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                  <img src={featuredImage.url} referrerPolicy="no-referrer" alt="Featured" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-[10px] font-bold rounded uppercase backdrop-blur-sm">
                    {featuredImage.sourceType}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Tiêu đề</p>
                <h4 className="font-bold leading-tight">{article.title}</h4>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Đường dẫn (Slug)</p>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">{article.slug}</code>
              </div>

              {/* Enhanced CTA Summary */}
              {ctaAudit.length > 0 && (
                <div className="flex gap-2">
                  <div className="flex-1 p-2 bg-green-50 rounded-lg border border-green-100 text-center">
                    <p className="text-[10px] text-green-600 font-bold uppercase">Shopping</p>
                    <p className="text-xl font-bold text-green-700">{ctaAudit.filter((c: any) => c.intentType === 'shopping').length}</p>
                  </div>
                  <div className="flex-1 p-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                    <p className="text-[10px] text-blue-600 font-bold uppercase">Coupon</p>
                    <p className="text-xl font-bold text-blue-700">{ctaAudit.filter((c: any) => c.intentType === 'coupon').length}</p>
                  </div>
                  <div className="flex-1 p-2 bg-red-50 rounded-lg border border-red-100 text-center">
                    <p className="text-[10px] text-red-600 font-bold uppercase">Errors</p>
                    <p className="text-xl font-bold text-red-700">{ctaAudit.filter((c: any) => c.status === 'fail').length}</p>
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto bg-white border border-gray-100 p-4 rounded-xl text-sm prose prose-orange">
                <div dangerouslySetInnerHTML={{ __html: article.content }} />
              </div>
              
              <div className="flex gap-4">
                <Button onClick={publish} loading={publishing} className="flex-1">
                  Đăng dưới dạng {settings?.postStatus === 'draft' ? 'BẢN NHÁP' : 'CÔNG KHAI'}
                </Button>
                <Button variant="secondary" onClick={() => { setArticle(null); setCtaAudit([]); }}>Hủy bỏ</Button>
              </div>

              {/* cta Audit Section */}
              {ctaAudit.length > 0 && (
                <div className="mt-4 pt-4 border-t border-orange-100 italic text-[10px]">
                  <p className="font-bold mb-2 text-orange-400 uppercase tracking-widest">CTA Audit (Debug)</p>
                  <div className="space-y-2">
                    {ctaAudit.map((cta: any) => (
                      <div key={cta.pos} className={`flex flex-col gap-1 p-2 rounded-lg border shadow-sm ${cta.status === 'fail' ? 'bg-red-50 border-red-100' : 'bg-white border-orange-50' }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-700">CTA #{cta.pos}: "{cta.text}"</span>
                          <div className="flex gap-1 items-center">
                             <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                              cta.status === 'fail' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                             }`}>
                                {cta.status}
                             </span>
                             <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                               cta.intentType === 'shopping' ? 'bg-green-100 text-green-600' : 
                               cta.intentType === 'coupon' ? 'bg-blue-100 text-blue-600' : 
                               cta.intentType === 'sale' ? 'bg-purple-100 text-purple-600' :
                               'bg-gray-100 text-gray-600'
                             }`}>
                               {cta.intentType}
                             </span>
                          </div>
                        </div>
                        <div className="text-[9px] text-gray-400 font-mono flex justify-between">
                          <span>Source: {cta.sourceField}</span>
                          <span>{cta.brand}</span>
                        </div>
                        <div className="truncate text-gray-400 flex items-center gap-1 text-[9px] font-mono">
                          <Link2 size={10} />
                          {cta.href}
                        </div>
                        <div className="mt-1 p-1 bg-gray-900 rounded text-[8px] text-blue-300 font-mono overflow-x-auto whitespace-pre">
                          {cta.snippet}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </motion.div>
  );
}

function BrandManager({ brands, onUpdate, onSelectBrand }: any) {
  const [editing, setEditing] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    const b: Brand = {
      id: editing?.id || Date.now().toString(),
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      official_site: formData.get("official_site") as string,
      deals_url: formData.get("deals_url") as string,
      sale_url: formData.get("sale_url") as string,
      coupon_page_url: formData.get("coupon_page_url") as string,
      niche: formData.get("niche") as string,
      priority: formData.get("priority") as any,
      status: formData.get("status") as any,
      source_verified: editing?.source_verified || false,
      latest_offer_summary: editing?.latest_offer_summary,
      latest_offer_url: editing?.latest_offer_url,
      latest_offer_type: editing?.latest_offer_type as any,
      latest_offer_status: editing?.latest_offer_status as any,
      notes: formData.get("notes") as string,
      use_count: editing?.use_count || 0,
      last_used_at: editing?.last_used_at,
      affiliate_url: formData.get("affiliate_url") as string,
      affiliate_link_1: formData.get("affiliate_link_1") as string,
      affiliate_link_2: formData.get("affiliate_link_2") as string
    };

    try {
      await brandService.save(b);
      setEditing(null);
      onUpdate();
    } catch (err) {
      alert("Lỗi khi lưu thương hiệu");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Xóa thương hiệu này?")) return;
    await brandService.delete(id);
    onUpdate();
  };

  const toggleStatus = async (b: Brand) => {
    const newStatus = b.status === 'active' ? 'paused' : 'active';
    await brandService.save({ ...b, status: newStatus });
    onUpdate();
  };

  const emptyBrand = (): Brand => ({
    id: "", name: "", slug: "", official_site: "", deals_url: "", sale_url: "", coupon_page_url: "",
    niche: "Chung", priority: "medium", status: "active", source_verified: false,
    notes: "", use_count: 0,
    affiliate_link_1: "", affiliate_link_2: ""
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quản lý Thương hiệu</h2>
          <p className="text-gray-500">Cấu hình danh sách brand để tự động tạo nội dung.</p>
        </div>
        <Button onClick={() => setEditing(emptyBrand())}>
          <Plus size={18} /> Thêm mới
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {(Array.isArray(brands) ? brands : []).map((b: Brand) => (
          <Card key={b.id} className="relative group overflow-hidden hover:border-orange-200 transition-colors cursor-pointer" onClick={() => onSelectBrand(b.id)}>
            <div 
              onClick={(e) => { e.stopPropagation(); toggleStatus(b); }}
              className={`absolute top-0 right-0 p-2 text-[10px] font-bold uppercase ${b.status === 'active' ? 'bg-green-500' : 'bg-gray-400'} text-white rounded-bl-xl cursor-pointer hover:brightness-110 active:scale-95 transition-all`}
            >
              {b.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
            </div>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-bold">
                {b.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-lg">{b.name}</h4>
                <p className="text-xs text-gray-400">{b.niche}</p>
              </div>
            </div>
            
            <div className="space-y-2 mb-6 text-[11px]">
               {b.latest_offer_summary && (
                  <div className="p-2 bg-orange-50 text-orange-700 rounded-lg flex items-center gap-2">
                    <Tag size={12} className="shrink-0" />
                    <span className="truncate">{b.latest_offer_summary}</span>
                  </div>
               )}
              <div className="flex items-center justify-between text-gray-600">
                <div className="flex items-center gap-1.5"><LayoutDashboard size={12} /> {b.use_count} bài viết</div>
                <div className="flex items-center gap-1.5"><CheckCircle size={12} className={b.source_verified ? "text-green-500" : "text-gray-300"} /> {b.source_verified ? "Đã xác minh" : "Chưa xác minh"}</div>
              </div>
            </div>

            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <Button onClick={() => setEditing(b)} variant="secondary" className="flex-1 py-1 text-sm">Sửa nhanh</Button>
              <Button onClick={() => remove(b.id)} variant="secondary" className="px-2 text-red-400 hover:text-red-500 border-red-50">
                <Trash2 size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <Card className="w-full max-w-2xl">
                <h3 className="text-xl font-bold mb-6">{editing.id ? "Sửa Thương hiệu" : "Thêm Thương hiệu mới"}</h3>
                <form onSubmit={save} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Tên thương hiệu</label>
                      <input name="name" defaultValue={editing.name} required className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Đường dẫn (Slug)</label>
                      <input name="slug" defaultValue={editing.slug} required className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                      <p className="text-[10px] text-gray-400 font-medium">Slug ngắn, ví dụ: nike-deals-2024</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Trang chủ chính thức</label>
                      <input name="official_site" defaultValue={editing.official_site} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Trang khuyến mại (Deals)</label>
                      <input name="deals_url" defaultValue={editing.deals_url} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Trang xả kho (Sale)</label>
                      <input name="sale_url" defaultValue={editing.sale_url} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Trang mã giảm giá (Coupons)</label>
                      <input name="coupon_page_url" defaultValue={editing.coupon_page_url} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-orange-500 uppercase">Link Affiliate 1 (Mục tiêu chính)</label>
                      <input name="affiliate_link_1" defaultValue={editing.affiliate_link_1 || editing.affiliate_url} className="w-full px-4 py-2 bg-gray-50 border border-orange-200 bg-orange-50/10 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
                      <p className="text-[10px] text-gray-400 font-medium italic">Ưu tiên 1 cho CTA.</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-orange-500 uppercase">Link Affiliate 2 (Bổ sung)</label>
                      <input name="affiliate_link_2" defaultValue={editing.affiliate_link_2} className="w-full px-4 py-2 bg-gray-50 border border-orange-200 bg-orange-50/10 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
                      <p className="text-[10px] text-gray-400 font-medium italic">Phân bổ xen kẽ với Link 1.</p>
                    </div>
                  </div>

                  <input type="hidden" name="affiliate_url" defaultValue={editing.affiliate_link_1 || editing.affiliate_url} />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Lĩnh vực (Niche)</label>
                      <input name="niche" defaultValue={editing.niche} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Độ ưu tiên</label>
                      <select name="priority" defaultValue={editing.priority} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none">
                        <option value="high">Cao</option>
                        <option value="medium">Trung bình</option>
                        <option value="low">Thấp</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Ghi chú AI</label>
                    <textarea name="notes" defaultValue={editing.notes} rows={2} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button type="submit" loading={loading} className="flex-1">Lưu lại</Button>
                    <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Hủy bỏ</Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BrandDetail({ brandId, settings, onBack, onUpdate, onUseForBlog }: { brandId: string, settings: WPSettings | null, onBack: () => void, onUpdate: () => void, onUseForBlog: (task: any) => void }) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [detectedOffers, setDetectedOffers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBrand();
  }, [brandId]);

  const fetchBrand = async () => {
    setLoading(true);
    try {
      const data = await brandService.getById(brandId);
      setBrand(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    if (!brand) return;
    try {
      const res = await brandService.scan(brandId);
      // Perform extraction on frontend
      const extracted = await geminiService.extractOffers(brand.name, res.sourceContext, settings?.geminiApiKey);
      setDetectedOffers(extracted);
    } catch (err: any) {
      console.error("Scan error:", err);
      alert("Lỗi khi quét khuyến mại: " + (err.message || ""));
    } finally {
      setScanning(false);
    }
  };

  const saveOffer = async (offer: any) => {
    setSaving(true);
    try {
      await brandService.saveOffer(brandId, {
        summary: offer.text,
        url: offer.url,
        type: offer.type,
        status: 'verified'
      });
      await fetchBrand();
      setDetectedOffers([]);
      onUpdate();
      alert("Đã lưu khuyến mại thành công!");
    } catch (err) {
      alert("Lỗi khi lưu khuyến mại");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!brand) return;
    const newStatus = brand.status === 'active' ? 'paused' : 'active';
    await brandService.save({ ...brand, status: newStatus });
    await fetchBrand();
    onUpdate();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={48} /></div>;
  if (!brand) return <div className="text-center py-20">Không tìm thấy thương hiệu.</div>;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <header className="mb-10 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{brand.name}</h2>
          <p className="text-gray-500 text-sm">Hệ thống dữ liệu chi tiết thương hiệu</p>
        </div>
        {brand.source_verified && (
          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <CheckCircle size={14} /> Đã xác minh
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-bold uppercase ${brand.status === 'active' ? 'text-green-500' : 'text-gray-400'}`}>
            {brand.status === 'active' ? 'Đang hoạt động' : 'Đang tạm dừng'}
          </span>
          <button 
            onClick={toggleStatus}
            className={`w-12 h-6 rounded-full transition-colors relative ${brand.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${brand.status === 'active' ? 'right-1' : 'left-1'}`} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <h3 className="font-bold text-lg mb-6">Thông tin Ưu đãi mới nhất</h3>
            {brand.latest_offer_summary ? (
              <div className="p-6 bg-orange-50 border border-orange-100 rounded-2xl space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">{brand.latest_offer_type}</span>
                    <h4 className="text-xl font-bold text-orange-900 leading-tight">{brand.latest_offer_summary}</h4>
                  </div>
                  <div className="bg-white p-2 rounded-xl text-orange-500 shadow-sm">
                    <Tag size={24} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-orange-700">
                  <div className="flex items-center gap-1"><RefreshCw size={14} /> Cập nhật: {new Date(brand.last_checked_at!).toLocaleString('vi-VN')}</div>
                  {brand.latest_offer_url && (
                    <a href={brand.latest_offer_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                      <ExternalLink size={14} /> Nguồn khuyến mại
                    </a>
                  )}
                </div>
                <div className="pt-4 flex gap-2">
                  <Button variant="secondary" className="text-orange-600 border-orange-200">Xác minh thủ công</Button>
                  <Button 
                    className="bg-orange-600"
                    onClick={() => onUseForBlog({ brand, type: 'Review', niche: brand.niche })}
                  >
                    Dùng cho bài viết mới
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                Chưa có dữ liệu khuyến mại. Hãy chạy quét dữ liệu.
              </div>
            )}

            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold">Hệ thống quét tự động</h4>
                <Button onClick={handleScan} loading={scanning} variant="secondary" className="text-orange-500 border-orange-100">
                  <RefreshCw size={16} /> Kiểm tra khuyến mại ngay
                </Button>
              </div>

              {detectedOffers.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3 pt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase">Khuyến mại tìm thấy:</p>
                  {detectedOffers.map((offer, idx) => (
                    <div key={idx} className="p-4 bg-white border border-gray-100 rounded-xl flex items-center justify-between shadow-sm group hover:border-orange-200 transition-colors">
                      <div>
                        <p className="font-bold text-sm">{offer.text}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">{offer.type}</p>
                      </div>
                      <Button onClick={() => saveOffer(offer)} loading={saving} variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        Lưu ưu đãi
                      </Button>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          </Card>

          <Card>
             <h3 className="font-bold text-lg mb-6">Cấu hình URL</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Official Site</label>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                    <Globe size={16} className="text-gray-400" />
                    <span className="text-sm truncate">{brand.official_site || 'Chưa thiết lập'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Deals URL</label>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                    <Tag size={16} className="text-gray-400" />
                    <span className="text-sm truncate">{brand.deals_url || 'Chưa thiết lập'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Sale URL</label>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                    <Plus size={16} className="text-gray-400" />
                    <span className="text-sm truncate">{brand.sale_url || 'Chưa thiết lập'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Coupon Page URL</label>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                    <ExternalLink size={16} className="text-gray-400" />
                    <span className="text-sm truncate">{brand.coupon_page_url || 'Chưa thiết lập'}</span>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-orange-400 uppercase">Affiliate Link (CTA)</label>
                  <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl text-orange-700">
                    <Link2 size={16} className="text-orange-400" />
                    <span className="text-sm font-bold truncate">{brand.affiliate_url || 'Chưa thiết lập'}</span>
                  </div>
                </div>
             </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <h3 className="font-bold text-lg mb-4">Trình trạng & Ghi chú</h3>
            <div className="space-y-4">
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Độ ưu tiên</p>
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                    brand.priority === 'high' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                  }`}>
                    {brand.priority} Priority
                  </span>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Ghi chú AI</p>
                  <div className="p-4 bg-gray-50 rounded-xl text-sm italic text-gray-600">
                    "{brand.notes || 'Không có ghi chú nào.'}"
                  </div>
               </div>
               <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                 <span>Tổng bài viết:</span>
                 <span className="font-bold text-gray-900">{brand.use_count}</span>
               </div>
               <div className="flex items-center justify-between text-xs text-gray-500">
                 <span>Lần cuối sử dụng:</span>
                 <span className="font-bold text-gray-900">{brand.last_used_at ? new Date(brand.last_used_at).toLocaleDateString() : 'Chưa dùng'}</span>
               </div>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}


function SettingsPage({ settings, categories, onSave }: any) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);

  const save = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setDiagnostic(null);
    const formData = new FormData(e.target);
    const s: WPSettings = {
      baseUrl: (formData.get("baseUrl") as string)?.trim(),
      wpLoginUsername: (formData.get("wpLoginUsername") as string)?.trim(),
      wpLoginPassword: formData.get("wpLoginPassword") as string, // No trim for password
      defaultCategoryId: parseInt(formData.get("defaultCategoryId") as string),
      postStatus: formData.get("postStatus") as any,
      geminiApiKey: (formData.get("geminiApiKey") as string)?.trim(),
      status: 'idle' 
    };

    try {
      console.log("[Settings] Saving settings...");
      const res = await settingsService.save(s);
      onSave();
      if (res && res.status === 'error') {
        alert("Đã lưu cấu hình, nhưng chưa xác thực được WordPress: " + (res.failReason || "Vui lòng kiểm tra lại Username/Password."));
        setDiagnostic({ success: false, message: "Cấu hình đã lưu nhưng kết nối lỗi", details: res.failReason });
      } else {
        alert("Cấu hình & Kết nối thành công!");
        setDiagnostic({ success: true, message: "Hệ thống đã xác thực và lưu cấu hình." });
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      setDiagnostic({ success: false, message: "Lưu thất bại", details: msg });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setDiagnostic(null);
    
    // Use current form values for real-time testing
    const form = document.querySelector('form') as HTMLFormElement;
    const formData = new FormData(form);
    const testData = {
      baseUrl: formData.get("baseUrl") as string,
      wpLoginUsername: formData.get("wpLoginUsername") as string,
      wpLoginPassword: formData.get("wpLoginPassword") as string
    };

    try {
      console.log("[Settings] Testing connection...");
      const res = await wpService.checkConnection(testData);
      setDiagnostic({
        success: true,
        message: res.message || "Kết nối thành công!",
        details: `Tên người dùng: ${res.wp_response?.name || 'WordPress User'}`
      });
      // Mark settings as verified if success
      if (settings && settings.baseUrl === testData.baseUrl) {
        await settingsService.save({ ...settings, 
          wpLoginUsername: testData.wpLoginUsername, 
          wpLoginPassword: testData.wpLoginPassword,
          status: 'verified' 
        } as any);
        onSave();
      }
    } catch (err: any) {
      console.error("[Settings] Test failed:", err);
      const data = err.response?.data;
      setDiagnostic({ 
        success: false, 
        message: "Lỗi kết nối WordPress", 
        details: data?.error || data?.failReason || err.message 
      });
      
      // Update local status to error if failed
      if (settings && settings.status === 'verified') {
        await settingsService.save({ ...settings, status: 'error' } as any);
        onSave();
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="mb-10">
        <h2 className="text-3xl font-bold tracking-tight">Cấu hình hệ thống</h2>
        <p className="text-gray-500">Kết nối website WordPress và cấu hình các thông số mặc định.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="h-fit">
          <form onSubmit={save} className="space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase">Gemini API Key</label>
              <input 
                type="password" 
                name="geminiApiKey" 
                defaultValue={settings?.geminiApiKey} 
                placeholder="Nhập API Key nếu không muốn dùng biến môi trường hệ thống" 
                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" 
              />
              <p className="text-[10px] text-gray-400">Ưu tiên sử dụng Key này khi tạo bài viết AI. Nếu bỏ trống, app sẽ dùng Key hệ thống.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase">WP Base URL</label>
              <input name="baseUrl" defaultValue={settings?.baseUrl} required placeholder="https://myblog.com" className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
              <p className="text-[10px] text-gray-400">Bao gồm https://, không có dấu gạch chéo ở cuối.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">WP Login Username</label>
                <input name="wpLoginUsername" defaultValue={settings?.wpLoginUsername} required className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">WP Login Password</label>
                <input type="password" name="wpLoginPassword" defaultValue={settings?.wpLoginPassword} required className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
                <p className="text-[10px] text-gray-400">Dùng tài khoản admin/editor của website.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Chuyên mục mặc định</label>
                <select name="defaultCategoryId" defaultValue={settings?.defaultCategoryId} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none">
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Trạng thái bài đăng</label>
                <select name="postStatus" defaultValue={settings?.postStatus} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none">
                  <option value="draft">Bản nháp (An toàn)</option>
                  <option value="publish">Công khai (Live)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" loading={loading} className="flex-1">
                <Save size={18} /> Lưu cấu hình
              </Button>
              <Button type="button" variant="secondary" onClick={testConnection} loading={testing}>
                <RefreshCw size={18} /> Test kết nối
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Loader2 size={20} className={testing ? "animate-spin text-orange-500" : "text-gray-400"} />
              Chẩn đoán hệ thống
            </h3>
            
            {!diagnostic ? (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-50 rounded-2xl bg-gray-50/50">
                Nhấn "Test kết nối" để bắt đầu chẩn đoán REST API.
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${diagnostic.success ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                   <div className="flex items-start gap-3">
                      {diagnostic.success ? <CheckCircle className="shrink-0 mt-1" /> : <AlertCircle className="shrink-0 mt-1" />}
                      <div className="space-y-1">
                         <p className="font-bold text-sm">{diagnostic.success ? "Kết nối thành công" : "Kết nối thất bại"}</p>
                         <p className="text-xs opacity-90">{diagnostic.message || diagnostic.errorGroup}</p>
                         {!diagnostic.success && <p className="text-xs font-bold mt-2 underline italic">Gợi ý: {diagnostic.suggestion}</p>}
                      </div>
                   </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase ml-1">Chi tiết kỹ thuật</p>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-4 font-mono text-[11px] border border-gray-100">
                    <div>
                      <span className="text-gray-400 font-bold uppercase block mb-1">Normalized Base URL</span>
                      <p className="text-orange-600 font-bold break-all">
                        {diagnostic.normalizedUrl || (settings?.baseUrl?.replace(/\/wp-admin(\/.*)?$/, '').replace(/\/admin(\/.*)?$/, '').replace(/\/$/, ''))}
                      </p>
                    </div>

                    <div className="space-y-3">
                       <span className="text-gray-400 font-bold uppercase block">Nhật ký xử lý (Steps)</span>
                       {!diagnostic.logs || diagnostic.logs.length === 0 ? (
                         <div className="p-3 bg-white border border-gray-100 rounded-lg text-gray-400 italic">
                            Không có nhật ký bước nào được trả về. Kiểm tra lại URL.
                         </div>
                       ) : (
                         diagnostic.logs.map((log: any, idx: number) => (
                           <div key={idx} className="p-3 bg-white border border-gray-100 rounded-lg space-y-2 shadow-sm">
                              <div className="flex items-center justify-between">
                                 <span className="font-bold text-gray-700">{log.step}</span>
                                 <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${log.status >= 200 && log.status < 300 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                   STATUS: {log.status}
                                 </span>
                              </div>
                              <p className="text-[10px] text-gray-400 break-all">{log.url}</p>

                              {log.sentHeaders && (
                                <div className="p-2 bg-blue-50/50 rounded text-[9px] text-blue-600 border border-blue-50">
                                 <span className="font-bold uppercase block mb-1">Request Headers:</span>
                                 <div className="space-y-0.5 opacity-80">
                                   {Object.entries(log.sentHeaders).map(([k, v]: any) => (
                                     <div key={k}>{k}: {v}</div>
                                   ))}
                                 </div>
                                </div>
                              )}

                              <div className="p-2 bg-gray-50 rounded text-gray-500 overflow-x-auto whitespace-pre-wrap max-h-24 overflow-y-auto">
                                 {log.body}
                              </div>
                           </div>
                         ))
                       )}
                    </div>

                    {diagnostic.user && (
                      <div className="pt-2 border-t border-gray-100">
                        <span className="text-gray-400 font-bold uppercase block mb-1">User Info</span>
                        <div className="flex items-center gap-2 text-green-600 font-bold">
                           <CheckCircle size={14} />
                           {diagnostic.user.name} ({diagnostic.user.roles?.join(', ')})
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

function HistoryPage({ logs }: { logs: ActivityLog[] }) {
  const [filter, setFilter] = useState<'all' | 'publish' | 'generate' | 'sync'>('all');

  const filteredLogs = logs.filter(l => filter === 'all' || l.type === filter);

  const getIcon = (type: string) => {
    switch (type) {
      case 'publish': return <Globe size={20} />;
      case 'generate': return <RefreshCw size={20} />;
      case 'sync': return <Tag size={20} />;
      default: return <History size={20} />;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Lịch sử hoạt động</h2>
          <p className="text-gray-500">Theo dõi toàn bộ nhật ký hệ thống: Bài viết, AI generation và Scan ưu đãi.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {['all', 'publish', 'generate', 'sync'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t as any)}
              className={`px-4 py-2 text-xs font-bold rounded-lg capitalize transition-all ${
                filter === t ? "bg-white text-orange-500 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === 'all' ? 'Tất cả' : t}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-50 rounded-2xl">
            Chưa có lịch sử thuộc mục này.
          </div>
        ) : (
          filteredLogs.map((log: ActivityLog) => (
            <Card key={log.id} className="flex items-center gap-6 p-4 hover:border-orange-100 transition-colors">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                log.status === 'success' ? 'bg-orange-50 text-orange-500' : 'bg-red-50 text-red-500'
              }`}>
                {log.status === 'error' ? <AlertCircle size={22} /> : getIcon(log.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full font-bold text-gray-500 uppercase tracking-wider">{log.brandName}</span>
                  <span className="text-[10px] font-bold text-gray-300 uppercase shrink-0 tracking-widest">{log.type}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{new Date(log.timestamp).toLocaleString('vi-VN')}</span>
                </div>
                <h4 className="font-bold text-gray-900 truncate">{log.title}</h4>
                <p className="text-xs text-gray-500 truncate">{log.details}</p>
                {log.errorMessage && <p className="text-[10px] text-red-500 mt-1 italic">Lỗi: {log.errorMessage}</p>}
              </div>
              <div className="flex gap-2">
                {log.wpUrl && (
                  <a href={log.wpUrl} target="_blank" rel="noopener noreferrer" className="p-3 bg-gray-50 text-orange-500 hover:bg-orange-100 rounded-xl transition-colors shadow-sm">
                    <ExternalLink size={18} />
                  </a>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  );
}

function MediaLibrary({ brands }: { brands: Brand[] }) {
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      const data = await mediaService.getAll();
      setMedia(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addImage = async (e: any) => {
    e.preventDefault();
    setUploading(true);
    const formData = new FormData(e.target);
    const newMedia: MediaRecord = {
      id: Date.now().toString(),
      url: formData.get("url") as string,
      sourceType: 'library',
      brandId: formData.get("brandId") as string || undefined,
      niche: formData.get("niche") as string || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await mediaService.save(newMedia);
      fetchMedia();
      e.target.reset();
    } catch (err) {
      alert("Lỗi khi lưu ảnh");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Xóa ảnh này khỏi thư viện?")) return;
    await mediaService.delete(id);
    fetchMedia();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="mb-10">
        <h2 className="text-3xl font-bold tracking-tight">Thư viện ảnh</h2>
        <p className="text-gray-500">Quản lý nguồn ảnh cho các bài viết blog.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <h3 className="font-bold text-lg mb-4">Thêm ảnh mới</h3>
            <form onSubmit={addImage} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">URL ảnh</label>
                <input name="url" required placeholder="https://..." className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Thương hiệu (Tùy chọn)</label>
                <select name="brandId" className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none">
                  <option value="">-- Không chọn --</option>
                  {(Array.isArray(brands) ? brands : []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Lĩnh vực (Niche)</label>
                <input name="niche" placeholder="VD: Fashion, Tech..." className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
              <Button type="submit" loading={uploading} className="w-full">
                <Plus size={18} /> Thêm vào thư viện
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={32} /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {media.map((m) => (
                <div key={m.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-100">
                  <img src={m.url} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Media" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <p className="text-white text-[10px] font-bold truncate w-full text-center">
                      {m.brandId ? (Array.isArray(brands) ? brands : []).find(b => b.id === m.brandId)?.name : m.niche || 'Tất cả'}
                    </p>
                    <button onClick={() => remove(m.id)} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-lg backdrop-blur-md">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {media.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                  Chưa có ảnh nào trong thư viện.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

