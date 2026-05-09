import { executeWpRest, uploadWpMedia, checkWpConnection } from "../lib/wordpressClient";

export interface WPPost {
  id?: number;
  title: string | { rendered: string };
  content: string | { rendered: string };
  status: 'publish' | 'draft' | 'pending' | 'private';
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  format?: string;
  excerpt?: string | { rendered: string };
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

/**
 * Service layer for WordPress REST API operations.
 */
export const wpService = {
  /**
   * Verify connection and credentials.
   */
  async verifyConnection(baseUrl: string, credentials?: { username?: string, password?: string }) {
    return await checkWpConnection(baseUrl, credentials);
  },

  /**
   * Fetch current user info (test auth).
   */
  async getCurrentUser(baseUrl: string, credentials?: { username?: string, password?: string }) {
    return await executeWpRest(baseUrl, "GET", "/wp/v2/users/me", null, credentials);
  },

  /**
   * Create a new post.
   */
  async createPost(baseUrl: string, postData: Partial<WPPost>, credentials?: { username?: string, password?: string }) {
    return await executeWpRest(baseUrl, "POST", "/wp/v2/posts", postData, credentials);
  },

  /**
   * Update an existing post.
   */
  async updatePost(baseUrl: string, postId: number, postData: Partial<WPPost>, credentials?: { username?: string, password?: string }) {
    return await executeWpRest(baseUrl, "POST", `/wp/v2/posts/${postId}`, postData, credentials);
  },

  /**
   * Upload media to WordPress.
   */
  async uploadMedia(baseUrl: string, buffer: Buffer, filename: string, mimeType: string, credentials?: { username?: string, password?: string }, additionalData?: any) {
    return await uploadWpMedia(baseUrl, buffer, filename, mimeType, credentials, additionalData);
  },

  /**
   * Get all categories.
   */
  async getCategories(baseUrl: string, credentials?: { username?: string, password?: string }): Promise<WPCategory[]> {
    return await executeWpRest(baseUrl, "GET", "/wp/v2/categories?per_page=100", null, credentials);
  },

  /**
   * Get tags.
   */
  async getTags(baseUrl: string, credentials?: { username?: string, password?: string }) {
    return await executeWpRest(baseUrl, "GET", "/wp/v2/tags?per_page=100", null, credentials);
  },

  /**
   * Update site settings.
   */
  async updateSettings(baseUrl: string, settings: any, credentials?: { username?: string, password?: string }) {
    return await executeWpRest(baseUrl, "POST", "/wp/v2/settings", settings, credentials);
  }
};
