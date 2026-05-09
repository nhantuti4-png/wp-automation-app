import fs from "fs";
import path from "path";
import { OptimizerSettings } from "../types";
import { stores } from "./memoryPersistence";

const DEFAULT_SETTINGS: OptimizerSettings = {
  mode: 'test',
  max_images_per_run: 5,
  max_posts_scan: 5,
  resize_width: 1400,
  webp_quality: 70,
  min_file_size_kb: 300,
  delay_ms: 3000,
  
  enable_cleaner: true,
  delete_delay_minutes: 5,
  delete_mode: 'trash',

  require_replace_verification: true,
  check_featured_image: true,
  check_post_content: true,
  allow_delete_if_not_verified: false,

  retry_limit: 3,
  fast_store_mode: true,
  target_post_types: ['posts', 'pages', 'store'],
  enable_logs: true,
  log_level: 'info',
  dry_run: false
};

class OptimizerConfigService {
  private settings: OptimizerSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): OptimizerSettings {
    const config = stores.settings.getItem("optimizer");
    if (config) {
      return { ...DEFAULT_SETTINGS, ...config };
    }
    return { ...DEFAULT_SETTINGS };
  }

  public getSettings(): OptimizerSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<OptimizerSettings>): { success: boolean; error?: string } {
    // Validation
    if (newSettings.delay_ms !== undefined && newSettings.delay_ms < 1000) {
      return { success: false, error: "Delay không được nhỏ hơn 1000ms" };
    }

    if (newSettings.mode === 'test' && newSettings.max_images_per_run !== undefined && newSettings.max_images_per_run > 20) {
      return { success: false, error: "Test mode không được xử lý quá 20 ảnh mỗi lần chạy" };
    }

    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    return { success: true };
  }

  public resetToDefault() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  private saveSettings() {
    stores.settings.set("optimizer", this.settings);
  }
}

export const optimizerConfig = new OptimizerConfigService();
