import axios from 'axios';

/**
 * Utility to manage WordPress REST API authentication via Application Passwords (Basic Auth).
 */
class WPAuthClient {
    private baseUrl: string;
    private authHeader: string = "";

    constructor(baseUrl: string) {
        // Robust URL normalization
        let normalized = (baseUrl || "").trim();
        
        // 1. Ensure Protocol
        if (normalized && !normalized.startsWith('http')) {
            normalized = 'https://' + normalized;
        }

        // 2. Remove common administrative and API paths from the base
        normalized = normalized.replace(/\/$/, '')
                              .replace(/\/wp-admin(\/.*)?$/, '')
                              .replace(/\/wp-login\.php(\/.*)?$/, '')
                              .replace(/\/wp-json(\/.*)?$/, '');
        
        this.baseUrl = normalized;
    }

    public getBaseUrl() {
        return this.baseUrl;
    }

    /**
     * Sets up the Basic Auth header using username and Application Password.
     */
    private setupAuth(credentials?: { username?: string, password?: string }) {
        // Use provided credentials, or fallback ONLY if strictly undefined (not empty string)
        const username = credentials?.username !== undefined ? credentials.username : process.env.WP_LOGIN_USERNAME;
        const password = credentials?.password !== undefined ? credentials.password : process.env.WP_LOGIN_PASSWORD;

        if (!username || !password) {
            throw new Error("AUTH_FAILED: WordPress username hoặc Application Password chưa được thiết lập.");
        }

        // Use UTF-8 encoding for both components to match standard browser btoa behavior for high-ascii
        const token = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
        this.authHeader = `Basic ${token}`;
        
        // Log debug
        const maskedToken = token.substring(0, 4) + "****" + token.substring(token.length - 4);
        console.log(`[WP DEBUG] Target: ${this.baseUrl} | Auth Header: Basic ${maskedToken}`);
    }

    /**
     * Executes a REST API request with Basic Auth.
     */
    public async request(method: string, path: string, data?: any, credentials?: { username?: string, password?: string }): Promise<any> {
        this.setupAuth(credentials);

        let apiPath = path.replace(/^\/+/, '');
        // Avoid double /wp-json/
        if (apiPath.startsWith('wp-json/')) {
            apiPath = apiPath.substring(8);
        }
        
        // Ensure path starts with leading slash for building the full URL
        apiPath = apiPath.startsWith('/') ? apiPath : '/' + apiPath;
        const fullUrl = `${this.baseUrl}/wp-json${apiPath}`;

        try {
            const res = await axios({
                method,
                url: fullUrl,
                data,
                headers: {
                    'Authorization': this.authHeader,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                timeout: 15000 // 15s timeout
            });
            console.log(`[WP DEBUG] ${method} ${fullUrl} STATUS: ${res.status}`);
            return res.data;
        } catch (err: any) {
            const status = err.response?.status;
            const message = err.response?.data?.message || err.message;
            const code = err.response?.data?.code || "unknown_error";
            
            console.error(`[WP DEBUG] ${method} ${fullUrl} FAILED | Status: ${status} | Code: ${code} | Msg: ${message}`);
            
            if (status === 401) {
                // If it's rest_not_logged_in, specifically mention authentication failure
                if (code === 'rest_not_logged_in') {
                    throw new Error(`AUTH_FAILED: WordPress REST API không chấp nhận tài khoản. Hãy chắc chắn bạn dùng 'Application Password' (không phải mật khẩu đăng nhập). (WP Code: ${code})`);
                }
                throw new Error(`AUTH_FAILED: Sai Application Password hoặc Username. (WP Code: ${code})`);
            }
            if (status === 404) {
                throw new Error(`NOT_FOUND: Không tìm thấy REST API tại ${fullUrl}. Hãy kiểm tra xem URL đã đúng chưa.`);
            }
            throw new Error(`WP_API_ERROR: ${message} (Status: ${status}, Code: ${code})`);
        }
    }

    /**
     * Specialized media upload using multipart/form-data with Basic Auth.
     */
    public async uploadMedia(buffer: Buffer, filename: string, mimeType: string, credentials?: { username?: string, password?: string }, additionalData?: any): Promise<any> {
        this.setupAuth(credentials);

        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', buffer, { filename, contentType: mimeType });

        if (additionalData) {
            Object.entries(additionalData).forEach(([key, value]) => {
                if (key !== 'meta') form.append(key, String(value));
            });
        }

        const fullUrl = `${this.baseUrl}/wp-json/wp/v2/media`;

        try {
            const res = await axios.post(fullUrl, form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': this.authHeader,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
            });

            const uploadRes = res.data;

            // Handle optional meta update
            if (uploadRes.id && additionalData?.meta) {
                try {
                    await this.request('POST', `/wp/v2/media/${uploadRes.id}`, { meta: additionalData.meta }, credentials);
                } catch (e) {
                    console.warn("[WP] Failed to update media meta after upload:", e);
                }
            }

            return uploadRes;
        } catch (err: any) {
            const status = err.response?.status;
            const message = err.response?.data?.message || err.message;
            console.error(`[WP API ERROR] Media Upload failed: ${status} - ${message}`);
            throw err;
        }
    }
}

// Singleton instances for different base URLs
const clients: Record<string, WPAuthClient> = {};

function getClient(baseUrl: string): WPAuthClient {
    const root = baseUrl.replace(/\/$/, '');
    if (!clients[root]) {
        clients[root] = new WPAuthClient(root);
    }
    return clients[root];
}

export async function checkWpConnection(baseUrl: string, credentials?: { username?: string, password?: string }): Promise<any> {
    const logs: any[] = [];
    const client = getClient(baseUrl);
    
    // Auth Check directly (skipping the root ping which might be blocked or return 404 in some setups)
    try {
        console.log(`[WP Diagnostic] Testing Auth for /users/me on ${baseUrl}...`);
        const start = Date.now();
        const userData = await client.request('GET', '/wp/v2/users/me', null, credentials);
        logs.push({
            step: "Authentication",
            status: 200,
            message: `Xác thực thành công. Xin chào, ${userData.name}!`,
            duration: Date.now() - start
        });
        
        return {
            success: true,
            name: userData.name,
            logs,
            normalizedUrl: client.getBaseUrl()
        };
    } catch (e: any) {
        const msg = e.message || "Lỗi xác thực";
        logs.push({
            step: "Authentication",
            status: e.message?.includes("401") ? 401 : 500,
            message: msg,
            error: true
        });
        
        throw {
            message: msg,
            logs,
            suggestion: msg.includes("401") 
                ? "Kiểm tra lại Username (thường là 'admin' hoặc email) và 'Application Password'." 
                : "Có lỗi xảy ra. Hãy đảm bảo URL đã chính xác và WP REST API đang hoạt động."
        };
    }
}

export async function executeWpRest(baseUrl: string, method: string, apiPath: string, data?: any, credentials?: { username?: string, password?: string }): Promise<any> {
    const client = getClient(baseUrl);
    return await client.request(method, apiPath, data, credentials);
}

export async function uploadWpMedia(baseUrl: string, buffer: Buffer, filename: string, mimeType: string, credentials?: { username?: string, password?: string }, additionalData?: any): Promise<any> {
    const client = getClient(baseUrl);
    return await client.uploadMedia(buffer, filename, mimeType, credentials, additionalData);
}

export async function checkImageUsageOnFrontend(baseUrl: string, urlToCheck: string): Promise<{ used: boolean; reason?: string }> {
    try {
        const res = await axios.get(baseUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000 
        });
        
        const html = res.data.toLowerCase();
        
        let path = "";
        try { path = new URL(urlToCheck).pathname; } catch(e) {}
        
        if (html.includes(urlToCheck.toLowerCase()) || (path && html.includes(path.toLowerCase()))) {
            return { used: true, reason: 'frontend_dom' };
        }

        return { used: false };
    } catch (e: any) {
        console.error("[WP] Frontend usage check failed:", e.message);
        return { used: true, reason: 'check_failed' };
    }
}

export async function getWpSettings(baseUrl: string, credentials?: { username?: string, password?: string }): Promise<any> {
    return await executeWpRest(baseUrl, "GET", "/wp/v2/settings", null, credentials);
}

export async function updateWpSettings(baseUrl: string, data: any, credentials?: { username?: string, password?: string }): Promise<any> {
    return await executeWpRest(baseUrl, "POST", "/wp-json/wp/v2/settings", data, credentials);
}


