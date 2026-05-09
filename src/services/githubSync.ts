
/**
 * GitHubSyncService: Optional off-site backup to a GitHub Gist.
 */

import axios from 'axios';
import { brandService, settingsService, memoryService } from './api';

export interface GistSyncConfig {
  token: string;
  gistId?: string;
  enabled: boolean;
}

const GIST_FILENAME = 'coupon_blog_backup.json';

export const githubSyncService = {
  async sync(config: GistSyncConfig) {
    if (!config.enabled || !config.token) return;

    try {
      console.log("[GitHub] Starting sync...");
      const brands = await brandService.getAll();
      const wpSettings = await settingsService.get('wp');
      const aiSettings = await settingsService.get('ai');
      const memories = await memoryService.getAll();

      const payload = {
        brands,
        wpSettings,
        aiSettings,
        memories,
        updatedAt: new Date().toISOString()
      };

      const gistPayload = {
        description: 'Coupon Blog Auto Publisher Backup',
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2)
          }
        }
      };

      const headers = {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json'
      };

      if (config.gistId) {
        // Update existing
        await axios.patch(`https://api.github.com/gists/${config.gistId}`, gistPayload, { headers });
        console.log("[GitHub] Sync successful to existing Gist.");
      } else {
        // Create new
        const res = await axios.post('https://api.github.com/gists', gistPayload, { headers });
        console.log("[GitHub] Sync successful. New Gist created:", res.data.id);
        return res.data.id;
      }
    } catch (e: any) {
      console.error("[GitHub] Sync failed:", e.response?.data || e.message);
      throw e;
    }
  },

  async restore(config: GistSyncConfig) {
    if (!config.token || !config.gistId) return;

    try {
      const headers = {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json'
      };

      const res = await axios.get(`https://api.github.com/gists/${config.gistId}`, { headers });
      const content = res.data.files[GIST_FILENAME].content;
      const data = JSON.parse(content);

      console.log("[GitHub] Data retrieved. Restoring to server...");

      if (data.brands) await brandService.saveBulk(data.brands);
      if (data.wpSettings) await settingsService.save(data.wpSettings, 'wp');
      if (data.aiSettings) await settingsService.save(data.aiSettings, 'ai');
      if (data.memories) {
        for (const m of data.memories) await memoryService.save(m);
      }

      console.log("[GitHub] Restore successful.");
      return true;
    } catch (e: any) {
      console.error("[GitHub] Restore failed:", e.response?.data || e.message);
      throw e;
    }
  }
};
