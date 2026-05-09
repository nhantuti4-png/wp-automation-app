import { Brand } from "../types.ts";

export interface RenderContext {
  brand: Brand;
  niche: string;
  primaryLink: string;
  secondaryLink: string;
  year?: string;
  [key: string]: any;
}

/**
 * Resolves placeholders in a string with aggressive regex matching.
 */
export function resolvePlaceholders(template: string, context: RenderContext): string {
  if (!template) return "";
  
  const currentYear = context.year || new Date().getFullYear().toString();
  const link1 = context.primaryLink;
  const link2 = context.secondaryLink || link1;
  const couponLink = context.brand.coupon_page_url || `/coupon/${context.brand.slug}`;
  const saleLink = context.brand.sale_url || context.brand.deals_url || link1;

  const placeholders: Record<string, string> = {
    "brand.name": context.brand.name,
    "brand.latest_offer_summary": context.brand.latest_offer_summary || "",
    "brand.latest_offer_type": context.brand.latest_offer_type || "",
    "brand.official_site": context.brand.official_site,
    "brand.slug": context.brand.slug,
    "niche": context.niche,
    "primaryLink": link1,
    "secondaryLink": link2,
    "AFF_LINK_1": link1,
    "AFF_LINK_2": link2,
    "CTA_LINK_1": link1,
    "CTA_LINK_2": link2,
    "SHOPPING_LINK": link1,
    "COUPON_LINK": couponLink,
    "INTERNAL_COUPON_LINK": couponLink,
    "SALE_LINK": saleLink,
    "DEAL_LINK": context.brand.deals_url || link1,
    "COUPON_CTA_LINK": couponLink
  };

  let rendered = template;

  // Fix common AI hallucination: raw URL followed by token in plain text
  // e.g. "https://brand.com [[SHOPPING_LINK]]" -> "[[SHOPPING_LINK]]"
  rendered = rendered.replace(/https?:\/\/[^\s"'<>]+?\s+\[\[[A-Z_]+?\]\]/g, (match) => {
    const token = match.match(/\[\[[A-Z_]+?\]\]/)?.[0] || "";
    return token;
  });

  // Resolve placeholders
  Object.keys(placeholders).forEach(key => {
    const val = placeholders[key];
    if (val === undefined) return;

    // Use regex for all permutations: ${key}, [[key]], [key]
    const patterns = [
      new RegExp(`\\$\\{${key.replace('.', '\\.')}\\}`, 'g'),
      new RegExp(`\\[\\[${key.replace('.', '\\.')}\\]\\]`, 'g'),
      // Only replace [Key] if it's in our specific list to avoid hitting normal English brackets
      key.includes('.') ? null : new RegExp(`\\[${key}\\]`, 'g')
    ].filter(Boolean) as RegExp[];

    patterns.forEach(re => {
      rendered = rendered.replace(re, val);
    });
  });

  // Handle specific global [Brackets]
  const globalBrackets: Record<string, string> = {
    "Brand": context.brand.name,
    "Year": currentYear,
    "Niche": context.niche
  };
  Object.keys(globalBrackets).forEach(k => {
    rendered = rendered.replace(new RegExp(`\\[${k}\\]`, 'g'), globalBrackets[k]);
  });

  return rendered;
}

/**
 * Ensures any remaining raw markers are converted to functional links or stripped.
 * Prevents "raw text with marker" leak.
 */
export function sanitizeCtaHtml(content: string, context: RenderContext): string {
  let sanitized = content;

  // 1. Detect raw tokens in plain text that AI failed to wrap in <a>
  const linkMappings: Record<string, { href: string, text: string }> = {
    "SHOPPING_LINK": { href: context.primaryLink, text: "Shop Now" },
    "COUPON_LINK": { href: context.brand.coupon_page_url || `/coupon/${context.brand.slug}`, text: "View Coupons" },
    "SALE_LINK": { href: context.brand.sale_url || context.brand.deals_url || context.primaryLink, text: "Shop Sale" }
  };

  Object.keys(linkMappings).forEach(token => {
    const re = new RegExp(`\\[\\[${token}\\]\\]`, 'g');
    const map = linkMappings[token];
    sanitized = sanitized.replace(re, `<a href="${map.href}" rel="nofollow sponsored noopener" target="_blank">${map.text}</a>`);
  });

  // 2. Resolve leftover Template placeholders (e.g. ${brand.name})
  sanitized = resolvePlaceholders(sanitized, context);

  return sanitized;
}

/**
 * Converts Markdown headers and basic formatting to HTML if AI leaks them.
 */
export function cleanMarkdown(content: string): string {
  if (!content) return "";
  let clean = content;
  
  // Headers: ### Header -> <h3>Header</h3>
  clean = clean.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  clean = clean.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  clean = clean.replace(/^# (.*$)/gim, '<h2>$1</h2>');
  
  // Bold: **text** -> <strong>text</strong>
  clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Lists: * item -> <li>item</li> (rough but helpful)
  // This is risky without <ul> wrapping so we only do simple bold/headers
  
  return clean;
}

/**
 * Validates that the content actually belongs to the intended brand.
 */
export function validateBrandMatch(content: string, expectedBrand: string): string | null {
  if (!content) return null;
  const lowerContent = content.toLowerCase();
  const lowerBrand = expectedBrand.toLowerCase();
  
  if (!lowerContent.includes(lowerBrand)) {
    return `Nội dung không chứa tên thương hiệu mong muốn: ${expectedBrand}`;
  }
  
  return null;
}

export function validateContent(content: string): string | null {
  if (!content) return null;
  
  // Aggressive check for ANY remaining interpolation fragments
  
  // 1. Double bracket markers: [[...]]
  // Exempt [[INLINE_IMAGE_X]] as they are resolved in the second pass in App.tsx
  const tokenMatch = content.match(/\[\[(?!INLINE_IMAGE_)[A-Z0-9_\.]+\]\]/);
  if (tokenMatch) {
    return `Unresolved CTA/template token found: ${tokenMatch[0]}`;
  }

  // 2. JS markers: ${...}
  const jsMatch = content.match(/\$\{[^}]+\}/);
  if (jsMatch) {
    return `Unresolved JS placeholder found: ${jsMatch[0]}`;
  }

  // 3. Logic leak: raw words like affiliate_link_1 or undefined
  if (content.includes("undefined") || content.includes("null")) {
     return "Phát hiện rò rỉ dữ liệu (undefined/null)";
  }

  // 4. Fallback check for "example.com"
  if (content.includes("example.com")) {
    return "Phát hiện liên kết placeholder example.com";
  }

  // 5. Validation: Chặn raw image URLs (WordPress URLs đứng trần không có tag img)
  const rawUrlMatch = content.match(/^https?:\/\/[^\s]+?\.(jpg|jpeg|png|webp|gif)$/m);
  if (rawUrlMatch) {
    return `Phát hiện URL ảnh thô chưa được render thành HTML: ${rawUrlMatch[0]}`;
  }

  return null;
}
