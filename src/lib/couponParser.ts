import { Page, Locator } from 'playwright';
import { CouponNormalized, AISettings } from '../types.ts';
import { AIPlanner, createAIPlanner } from './aiPlanners.ts';

export interface ExtractedCoupon {
  title: string;
  code: string | null;
  description: string;
  type: 'coupon' | 'deal';
  discountType: 'percentage' | 'fixed' | 'shipping' | 'other';
  discountValue: number;
  verified: boolean;
  ctaText: string;
}

export class CouponParser {
  private planner: AIPlanner | null = null;

  constructor(settings: AISettings) {
    this.planner = createAIPlanner(settings);
  }

  async parsePage(page: Page, brandName: string, logger: (type: string, msg: string) => void): Promise<CouponNormalized[]> {
    logger('info', `[PARSER] Starting semantic coupon extraction for ${brandName}...`);
    
    // 0. Ensure all content is loaded
    await page.evaluate(async () => {
       window.scrollTo(0, document.body.scrollHeight);
       await new Promise(r => setTimeout(r, 1000));
       window.scrollTo(0, 0);
    });

    // 1. Semantic DOM Extraction
    let coupons = await this.extractFromDOM(page, brandName, logger);
    
    // 2. Vision Fallback if needed
    if (coupons.length === 0 && this.planner) {
      logger('warn', `[PARSER] DOM extraction found 0 coupons. Failing over to Vision AI...`);
      const visionCoupons = await this.extractWithVision(page, brandName, logger);
      if (visionCoupons.length > 0) {
        coupons = visionCoupons;
      }
    }

    return coupons;
  }

  private async extractFromDOM(page: Page, brandName: string, logger: (type: string, msg: string) => void): Promise<CouponNormalized[]> {
    const results: CouponNormalized[] = [];

    const cardSelectors = [
      '[class*="coupon-card" i]',
      '[class*="offer-card" i]',
      '[class*="coupon-item" i]',
      '[class*="Card_container" i]',
      '.coupon-item',
      '.sc-coupon-card',
      'div:has(h3):has(button)',
      'li:has(h3):has(button)'
    ];

    let foundCards: Locator | null = null;
    for (const sel of cardSelectors) {
       const loc = page.locator(sel);
       const count = await loc.count().catch(() => 0);
       if (count > 1) {
         foundCards = loc;
         logger('info', `[PARSER] Detected coupon container: ${sel} (${count} cards)`);
         break;
       }
    }

    if (!foundCards) {
      foundCards = page.locator('div, li').filter({ hasText: /\d+%|\$\d+|FREE SHIPPING/i }).filter({ has: page.locator('button'), visible: true });
      const count = await foundCards.count().catch(() => 0);
      if (count > 0) logger('info', `[PARSER] Heuristic card detection found ${count} candidates.`);
      else return [];
    }

    const count = await foundCards.count().catch(() => 0);
    // Limit to top 10 for performance and reliability
    for (let i = 0; i < Math.min(count, 10); i++) {
      try {
        const card = foundCards.nth(i);
        if (!await card.isVisible()) continue;

        // 1. Initial Scraping (Title/Desc)
        const info = await card.evaluate((el) => {
          const title = el.querySelector('h2, h3, h4, [class*="title" i], [class*="heading" i]')?.textContent?.trim() || "";
          const desc = el.querySelector('[class*="description" i], [class*="detail" i], p')?.textContent?.trim() || "";
          const isVerified = (el as HTMLElement).innerText?.toLowerCase().includes('verified') || !!el.querySelector('[class*="verified" i], [class*="check" i]');
          const button = el.querySelector('button, [role="button"]');
          const buttonText = button?.textContent?.trim() || "";
          const hasCodeIcon = !!el.querySelector('[class*="code" i], [class*="scissors" i]');
          
          return { title, desc, isVerified, buttonText, hasCodeIcon };
        });

        if (!info.title) continue;

        // 2. Reveal Logic
        let extractedCode: string | null = null;
        const needsReveal = info.buttonText.toLowerCase().includes('code') || info.buttonText.toLowerCase().includes('reveal') || info.hasCodeIcon;

        if (needsReveal) {
          logger('info', `[PARSER] Attempting reveal for: ${info.title.substring(0, 30)}...`);
          const btn = card.locator('button, [role="button"]').first();
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1500);

          // Check for modal first
          const modal = page.locator('[class*="modal" i], [class*="popup" i], [class*="overlay" i]').filter({ visible: true }).last();
          if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
             extractedCode = await modal.evaluate((el) => {
                const codeEl = el.querySelector('[class*="code" i], .code-text, [class*="copied" i], [id*="code" i]');
                return codeEl?.textContent?.trim() || (el as HTMLElement).innerText?.match(/[A-Z0-9]{4,15}/)?.[0] || null;
             });
             
             // Close modal
             const closeBtn = page.locator('[class*="close" i], button[aria-label*="close" i]').first();
             if (await closeBtn.isVisible()) await closeBtn.click().catch(() => {});
             else await page.keyboard.press('Escape').catch(() => {});
             await page.waitForTimeout(500);
          } else {
             // Check if card itself updated (inline reveal)
             extractedCode = await card.evaluate((el) => {
                const codeEl = el.querySelector('[class*="code" i], .code-text, [class*="revealed" i]');
                return codeEl?.textContent?.trim() || null;
             });
          }
        } else {
          // Check if code is already visible (rare but possible)
          extractedCode = await card.evaluate((el) => {
             const codeEl = el.querySelector('[class*="code" i], .code-text');
             return codeEl?.textContent?.trim() || null;
          });
        }

        const cleanCode = this.cleanCode(extractedCode || "");
        const { type, value } = this.inferDiscount(info.title + " " + info.desc);
        
        results.push({
          store: brandName,
          code: cleanCode,
          title: info.title,
          description: info.desc,
          type: cleanCode ? 'coupon' : 'deal',
          discountType: type,
          discountValue: value,
          source: ['Semantic-DOM'],
          verified: info.isVerified,
          score: 0,
          affiliateUrl: "",
          lastSeen: new Date().toISOString()
        } as CouponNormalized);

      } catch (e) {
        logger('warn', `[PARSER] Card ${i} extraction failed: ${e}`);
      }
    }

    return results;
  }

  private async extractWithVision(page: Page, brandName: string, logger: (type: string, msg: string) => void): Promise<CouponNormalized[]> {
    if (!this.planner) return [];

    try {
      logger('info', `[VISION] Capturing current viewport...`);
      const screenshot = await page.screenshot({ type: 'png' }).then(buf => buf.toString('base64'));
      
      const prompt = `You are a high-precision coupon extraction AI. 
      Analyze the attached screenshot from ${brandName}'s store page.
      Extract ALL visible coupons and deals.
      
      For each coupon, provide:
      - title (e.g. "20% Off Storewide")
      - code (e.g. "SAVE20") if visible, or null if it's a deal
      - description (extra details)
      - type: "coupon" or "deal"
      - discountType: "percentage", "fixed", "shipping", or "other"
      - discountValue: Numeric value (e.g. 20 for 20%)
      - verified: boolean (if visual badge exists)
      
      Respond with VALID JSON ONLY in this format:
      {
        "coupons": [
          { "title": "...", "code": "...", "description": "...", "type": "coupon", "discountType": "percentage", "discountValue": 20, "verified": true }
        ]
      }`;

      const aiResult = await this.planner.plan(prompt, screenshot);
      
      if (aiResult && aiResult.coupons) {
        const visionResults = aiResult.coupons.map((c: any) => ({
          ...c,
          store: brandName,
          source: ['Vision-AI'],
          score: 0,
          affiliateUrl: "",
          lastSeen: new Date().toISOString()
        }));
        logger('success', `[VISION] AI extracted ${visionResults.length} coupons from image.`);
        return visionResults;
      }
    } catch (e) {
      logger('error', `[VISION ERROR] ${e}`);
    }
    return [];
  }

  private inferDiscount(text: string): { type: CouponNormalized['discountType'], value: number } {
    const percMatch = text.match(/(\d+)\s*%/);
    if (percMatch) return { type: 'percentage', value: parseInt(percMatch[1]) };

    const fixedMatch = text.match(/\$\s*(\d+)/);
    if (fixedMatch) return { type: 'fixed', value: parseInt(fixedMatch[1]) };

    if (text.toLowerCase().includes('free shipping')) return { type: 'shipping', value: 0 };

    return { type: 'other', value: 0 };
  }

  private cleanCode(code: string): string | null {
    if (!code) return null;
    const clean = code.replace(/GET CODE|SHOW CODE|COUPON|OFF|VIEW DEAL|GET DEAL|COPY|REVEAL/gi, '').trim().toUpperCase();
    if (clean.length < 3 || clean.length > 20 || clean === 'COUPON' || clean === 'CODE') return null;
    return clean;
  }
}
