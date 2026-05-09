export interface Brand {
  id: string;
  name: string;
  slug: string;
  official_site: string;
  deals_url: string;
  sale_url: string;
  coupon_page_url: string;
  niche: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'paused';
  last_checked_at?: string;
  latest_offer_summary?: string;
  latest_offer_url?: string;
  latest_offer_type?: '% OFF' | '$ OFF' | 'free shipping' | 'bundle deal' | 'starting from price';
  latest_offer_status?: 'verified' | 'unverified';
  source_verified: boolean;
  notes: string;
  last_used_at?: string;
  use_count: number;
  affiliate_url?: string;
  affiliate_link_1?: string;
  affiliate_link_2?: string;
}

export interface WPSettings {
  baseUrl: string;
  wpLoginUsername: string;
  wpLoginPassword: string;
  defaultCategoryId: number;
  postStatus: 'draft' | 'publish';
  status?: 'verified' | 'error' | 'idle';
  failReason?: string;
  geminiApiKey?: string;
  bridgeUrl?: string; // Local persistence agent URL (ngrok)
  localAgentStatus?: string;
  lastAgentRegister?: string;
  updatedAt?: number;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  brandName: string;
  type: 'publish' | 'generate' | 'sync';
  title: string;
  details: string; // Summary of what happened
  wpPostId?: number;
  wpUrl?: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ArticleForm {
  formId: string;
  formName: string;
  articleType: string;
  bestUseCase: string;
  titlePatterns: string[];
  introStyles: string[];
  requiredSections: {
    heading: string;
    description: string;
    keyPoints?: string[];
  }[];
  optionalSections: string[];
  ctaPositions: string[];
  ctaStyles: string[];
  toneProfiles: string[];
  closingStyles: string[];
  antiRepeatRules: string[];
}

export interface ArticleTask {
  brand: Brand;
  articleType: string;
  formId: string;
  structure: string;
  intro: string;
  tone: string;
  cta: string;
  title: string;
  niche: string;
}

export interface GenerationHistoryEntry {
  timestamp: string;
  brandId: string;
  articleType: string;
  structure: string;
  intro: string;
  tone: string;
  cta: string;
  title: string;
}

export interface ContentTask {
  brand: Brand;
  type: string;
  niche: string;
  patterns: {
    formId: string;
    structure: string;
    intro: string;
    tone: string;
    cta: string;
    title: string;
  };
}

export type ImageSourceType = 'official' | 'stock' | 'library' | 'ai';

export interface OptimizerSettings {
  mode: 'test' | 'production';
  
  // Optimizer Settings
  max_images_per_run: number;
  max_posts_scan: number;
  resize_width: number;
  webp_quality: number;
  min_file_size_kb: number;
  delay_ms: number;

  // Cleaner Settings
  enable_cleaner: boolean;
  delete_delay_minutes: number;
  delete_mode: 'trash' | 'force_delete';

  // Safety Settings
  require_replace_verification: boolean;
  check_featured_image: boolean;
  check_post_content: boolean;
  allow_delete_if_not_verified: boolean;

  // Performance
  retry_limit: number;
  
  // Fast Store Mode
  fast_store_mode: boolean;
  target_post_types: string[];

  // Logging
  enable_logs: boolean;
  log_level: 'info' | 'error' | 'debug';

  // Cleanup Safety
  dry_run: boolean;
}

export interface MediaRecord {
  id: string;
  url: string;
  sourceType: ImageSourceType;
  brandId?: string;
  niche?: string;
  tags?: string[];
  width?: number;
  height?: number;
  createdAt: string;
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini';
export type RuntimeMode = 'memory_only' | 'adaptive' | 'legacy' | 'training';
export type RecoveryMode = 'retry_memory' | 'ai_repair' | 'full_retrain';

export interface AISettings {
  openaiApiKey?: string;
  provider: AIProvider;
  model: string;
  enableRecovery: boolean;
  trainingMode: 'manual' | 'auto';
  runtimeMode: RuntimeMode;
  recoveryMode: RecoveryMode;
}

export type SemanticIntent = 
  | 'open_search'
  | 'type_brand'
  | 'select_brand'
  | 'reveal_coupon'
  | 'copy_code'
  | 'close_popup'
  | 'navigate_home'
  | 'verify_store_page';

export type ActionType = 'click' | 'type' | 'scroll' | 'wait' | 'hover';
export type StrategyType = 'semantic' | 'playwright' | 'vision' | 'text';

export interface WorkflowStep {
  action: ActionType;
  strategyType: StrategyType;
  value: string;
  text?: string;
  confidence?: number;
}

export interface WorkflowMemory {
  id?: string;
  hostname: string;
  intent: SemanticIntent;
  successRate: number;
  steps: WorkflowStep[];
  updatedAt: string;
  failCount?: number;
  recoveryCount?: number;
  stable?: boolean;
}

export interface TaskState {
  site: string;
  brand: string;
  currentIntent: SemanticIntent;
  completedIntents: SemanticIntent[];
  objective: string;
  failCount: number;
  startedAt: number;
  status: 'idle' | 'running' | 'success' | 'failed';
}

export interface CouponNormalized {
  store: string;
  code: string | null;
  title: string;
  description?: string;
  ctaText?: string;
  type: 'coupon' | 'deal';
  discountType: 'percentage' | 'fixed' | 'shipping' | 'other';
  discountValue: number;
  source: string[];
  verified: boolean;
  score: number;
  affiliateUrl: string;
  lastSeen: string;
  logoUrl?: string;
}

export type CouponQueueStatus = 
  | 'coupon_pending' 
  | 'coupon_fetching' 
  | 'coupon_parsing' 
  | 'coupon_scoring' 
  | 'coupon_syncing' 
  | 'coupon_done' 
  | 'coupon_failed';

export interface CouponTask {
  id: string;
  brandId: string;
  brandName: string;
  brandDomain: string;
  status: CouponQueueStatus;
  lastUpdated: string;
  errorMessage?: string;
  foundCount?: number;
  syncedCount?: number;
}
