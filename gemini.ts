import { GoogleGenAI, Type } from "@google/genai";
import { Brand } from "../types.ts";
import { ARTICLE_FORMS } from "./articlePatterns.ts";
import { resolvePlaceholders, validateContent, sanitizeCtaHtml, cleanMarkdown } from "../lib/renderUtils.ts";

const apiKey = process.env.GEMINI_API_KEY as string;

const aiClient = (key?: string) => new GoogleGenAI({ apiKey: key || apiKey });

export const geminiService = {
  extractOffers: async (brandName: string, context: string, overridingApiKey?: string) => {
    const key = overridingApiKey || apiKey;
    if (!key) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const ai = aiClient(key);
    const prompt = `
      You are an expert at extracting promotion data.
      Extract a list of active promotions from the following website content for the brand "${brandName}".
      
      Content:
      ${context.substring(0, 15000)}
      
      Requirements:
      1. Only extract real offers like: % OFF, $ OFF, free shipping, bundle deal, starting from price.
      2. If no clear offers are found, return an empty list. DO NOT HALLUCINATE.
      3. Format the result as a JSON array of objects: { "text": "Offer content", "type": "Offer type", "url": "Specific URL for this offer" }
      4. Valid offer types: "% OFF", "$ OFF", "free shipping", "bundle deal", "starting from price".
      5. Language: English.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["% OFF", "$ OFF", "free shipping", "bundle deal", "starting from price"] },
              url: { type: Type.STRING }
            },
            required: ["text", "type", "url"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  },

  generateArticle: async (
    brand: Brand, 
    type: string, 
    niche: string, 
    patterns: any, 
    sourceContext?: string, 
    overridingApiKey?: string,
    inlineImages: string[] = []
  ) => {
    const key = overridingApiKey || apiKey;
    if (!key) {
      throw new Error("GEMINI_API_KEY is missing. Please configure it in Settings or AI Studio Secrets.");
    }
    const ai = aiClient(key);
    
    // Explicit primary/secondary link logic
    const primaryLink = brand.affiliate_link_1 || brand.affiliate_url || brand.deals_url || brand.official_site;
    const secondaryLink = brand.affiliate_link_2 || primaryLink;

    // Lookup pattern details strictly from ARTICLE_FORMS
    const form = ARTICLE_FORMS.find(f => f.formId === patterns.formId);
    if (!form) throw new Error(`Pattern Form ${patterns.formId} not found in fixed data.`);

    const renderContext = {
      brand,
      niche,
      primaryLink,
      secondaryLink
    };

    // Pre-resolve metadata patterns
    const resolvedTitlePattern = resolvePlaceholders(form.titlePatterns[patterns.titleIndex] || form.titlePatterns[0], renderContext);
    const resolvedIntroStyle = resolvePlaceholders(form.introStyles[patterns.introIndex] || form.introStyles[0], renderContext);
    const resolvedToneProfile = resolvePlaceholders(form.toneProfiles[patterns.toneIndex] || form.toneProfiles[0], renderContext);
    const resolvedCtaStyle = resolvePlaceholders(form.ctaStyles[patterns.ctaIndex] || form.ctaStyles[0], renderContext);
    const resolvedSections = form.requiredSections.map(s => ({
       heading: resolvePlaceholders(s.heading, renderContext),
       description: resolvePlaceholders(s.description, renderContext)
    }));
    const resolvedAntiRepeat = form.antiRepeatRules.map(r => resolvePlaceholders(r, renderContext));

    const isReviewStory = form.formId === 'review_story';
    
    // Customize core rules for Review Story
    const styleInstructions = isReviewStory 
      ? `
      STRICT STYLE RULES (REVIEW STORY):
      1. LENGTH: 600-1200 words. Must feel like a real comprehensive blog post.
      2. TONE: Natural, human, lifestyle. Avoid any robotic phrases or standard AI "editorial" voice. 
      3. PERSONA: You are a real person sharing their story with the products. Use first-person ("I", "my") naturally.
      4. HOOK: Start with a 2-line emotional hook that draws the reader in.
      5. CONTENT DEPTH: Include how the item feels when worn, specific fit details (softness, weight, durability), and real-world usage contexts (gym, travel, daily routine).
      6. TARGET AUDIENCE: Explicitly mention who this is for and, importantly, who it might NOT be for.
      7. FORMAT: OUTPUT ONLY CLEAN HTML. DO NOT USE MARKDOWN (NO #, ##, ###). Use only HTML tags (<h2>, <h3>, <p>, <strong>, <ul>, <li>).
      8. CONVERSION: Mention deals and promo codes naturally within the narrative. Avoid a "hard sell" tone.
      9. IMAGE RULES: 
          - MANDATORY: Insert the following markers to place images: [[INLINE_IMAGE_1]], [[INLINE_IMAGE_2]], [[INLINE_IMAGE_3]], [[INLINE_IMAGE_4]].
          - YOU MUST USE ALL 4 MARKERS.
          - Distribute them after descriptive paragraphs to visually reinforce the storytelling.
      `
      : `
      STRICT STYLE RULES (PERSONA):
      1. LANGUAGE: The entire article MUST be in ENGLISH.
      2. TONE: Natural shopping editorial. Practical, easy to scan, not over-polished.
      3. PERSONA: You are a helpful contributor to a shopping blog. Avoid "Fake Authority".
      4. FORMAT: OUTPUT ONLY CLEAN HTML. DO NOT USE MARKDOWN. Use only HTML tags (<h2>, <h3>, <p>, <strong>, <ul>, <li>).
      5. IMAGE RULES: 
          - MANDATORY: Insert exactly 2 markers: [[INLINE_IMAGE_1]] and [[INLINE_IMAGE_2]].
          - Place [[INLINE_IMAGE_1]] immediately after the Intro section.
          - Place [[INLINE_IMAGE_2]] before the "Where to save more" section.
          - DO NOT repeat the featured image in the article body.
      `;

    const prompt = `
      You are a helpful Shopping Editor for a coupon/blog site.
      Task: Write a ${isReviewStory ? 'comprehensive Review Story' : 'blog post'} for "${brand.name}".

      ${styleInstructions}

      STRICT DATA RULES (MANDATORY): 
         - Use "REAL SOURCE DATA" below as your primary information source.
         - Cite real deals/discounts if found. Do not invent codes.
         - If NO specific sale found, soften the tone. 
         - BANNED PHRASES: "has quickly become a go-to", "fit a variety of styles", "look no further", "game-changer", "redefines", "unparalleled".
         - PARAGRAPHS: Keep it punchy.

      ${isReviewStory ? `
      STRUCTURE TO FOLLOW:
      - 2-line Emotional Hook.
      - Personal Introduction to [Brand].
      - [[INLINE_IMAGE_1]]
      - The Experience: How it actually feels and fits.
      - Real-World Usage: Where you used it.
      - [[INLINE_IMAGE_2]]
      - Value Discussion: Is it worth the investment?
      - [[INLINE_IMAGE_3]] (if available)
      - Deals & Savings: Natural mention of active codes from source data.
      - Final Verdict: Who should buy this.
      ` : `
      STRUCTURE TO FOLLOW:
      - Short Intro (2 sentences).
      - [[INLINE_IMAGE_1]]
      - Section 1: What stands out (Practical highlights).
      - Section 2: What to check before buying (Specific considerations).
      - [[INLINE_IMAGE_2]]
      - Section 3: Where to save more (Current deals/coupons).
      - Final Takeaway: Who should buy it.
      `}

      STRICT ARTICLE FORM: ${form.formName}
      - Title Pattern: ${resolvedTitlePattern}
      - Intro Style: ${resolvedIntroStyle}
      - Core Tone: ${resolvedToneProfile}
      - CTA Style to Use: ${resolvedCtaStyle}

      REQUIRED CONTENT SECTIONS:
      ${resolvedSections.map(s => "### " + s.heading + "\n" + s.description).join('\n\n')}

      REAL SOURCE DATA (OFFICIAL CONTEXT):
      ${sourceContext || "No raw data from site available."}
      
      BRAND INFO:
      - Niche: ${niche}
      - Latest Verified Offer: ${brand.latest_offer_summary || 'N/A'}
      - Official Site: ${brand.official_site}

      INTENT-BASED LINKING STRATEGY (CRITICAL):
      You MUST distinguish between THREE separate groups of CTAs:

      1. SHOPPING CTAs: Use [[SHOPPING_LINK]]
         - WORDING: Use "Explore more at ${brand.name}" or "Check the Site" if no specific category data is available.
         - IF you have specific category data from sourceContext, you can use "Browse Knitwear" or similar.
      
      2. COUPON CTAs (Internal): Use [[COUPON_LINK]]
         - Intent: Get codes on YOUR site.
         - Text: "Find Active Coupons", "Check for Codes", "View Promo Codes".

      3. SALE CTAs (Deep-link): Use [[SALE_LINK]]
         - Intent: Direct to CLEARANCE/SALE section.
         - ONLY use if "Has Sale Page" is YES.
         - Text: "Browse Sale Items", "Shop Clearance".

      STRICT FORMATTING RULE:
      - ONLY use tokens inside the 'href' attribute of <a> tags.
      - NEVER write the token name or a raw URL in the plain text of the article.
      - Example GOOD: <a href="[[SHOPPING_LINK]]">Shop Now</a>
      - Example BAD: Visit [[SHOPPING_LINK]] (text leak)
      - Example BAD: https://brand.com [[SHOPPING_LINK]] (redundant leak)

      SALE/CLEARANCE LINKS:
      - IF sale_url exists: use [[SALE_LINK]] with words like "Browse Clearance".
      - IF NO sale_url: MUST use [[SHOPPING_LINK]] with neutral words like "Visit ${brand.name}".

      STRICT MAPPING RULES:
      - DO NOT use [[SHOPPING_LINK]] for "coupon" or "code" text.
      - DO NOT use [[COUPON_LINK]] for generic "shop now" text.
      - MANDATORY: If the article mentions "coupons", "promo codes", or "discounts" anywhere in the text, you MUST include at least one [[COUPON_LINK]].

      AVAILABILITY DATA:
      - Has Sale Page: ${brand.sale_url ? 'YES' : 'NO'}
      - Has Internal Coupon URL: ${brand.coupon_page_url ? 'YES' : 'NO'}

      CTA PLACEMENT RULES:
      - If mentioning "codes" or "discounts", you MUST include at least one [[INTERNAL_COUPON_LINK]].
      - Distribute CTAs naturally.
      - Attributes: rel="nofollow sponsored noopener" target="_blank"

      CRITICAL CONTENT RULES:
      1. ANTI-REPETITION: ${resolvedAntiRepeat.join('. ')}. 
      2. FORMAT: Use HTML (H2, H3, strong, ul, li).
      
      Output MUST be JSON: { "title": "...", "slug": "...", "excerpt": "...", "content": "..." }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            slug: { type: Type.STRING },
            excerpt: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["title", "slug", "excerpt", "content"],
        },
      },
    });

    const result = JSON.parse(response.text);

    // POST-GENERATION RENDERING: Resolve tokens and placeholders
    console.log("--- Post-Generation Render Check for Brand: " + brand.name + " ---");
    
    // Supplement context for tokens
    const finalRenderContext = {
      ...renderContext,
      SHOPPING_LINK: primaryLink,
      COUPON_LINK: brand.coupon_page_url || '/coupon/' + brand.slug,
      SALE_LINK: brand.sale_url || brand.deals_url || primaryLink,
      INTERNAL_COUPON_LINK: brand.coupon_page_url || '/coupon/' + brand.slug,
      DEAL_LINK: brand.deals_url || primaryLink,
      // Handle dynamic number of inline images
      ...Object.fromEntries(inlineImages.map((url, i) => [`INLINE_IMAGE_${i + 1}`, url]))
    };

    result.title = resolvePlaceholders(result.title, finalRenderContext);
    result.slug = resolvePlaceholders(result.slug, finalRenderContext);
    result.excerpt = resolvePlaceholders(result.excerpt, finalRenderContext);
    
    // Multi-pass resolution for content
    let finalContent = result.content;
    finalContent = cleanMarkdown(finalContent); // 1. Fix Markdown leaks
    finalContent = resolvePlaceholders(finalContent, finalRenderContext); // 2. Resolve link tokens
    finalContent = sanitizeCtaHtml(finalContent, finalRenderContext); // 3. Ensure HTML safety
    result.content = finalContent;

    // FINAL VALIDATION across all fields
    const validationError = validateContent(result.title + " " + result.slug + " " + result.content);
    if (validationError) {
      console.error("AI Generation resulted in invalid placeholders:", validationError);
    }

    return result;
  },
};
