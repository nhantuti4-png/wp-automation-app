# BLOG_CONTENT_RULES.md

## Content Standards for Coupon/Affiliate Sites

### 1. Tone & Voice
- Help-oriented, savvy, "insider" knowledge.
- Focus on saving money and maximum value.
- Avoid generic corporate speak or dry news reporting.

### 2. Structure
- **Title**: Catchy, includes "Coupon", "Save", "Deals", or specific benefit.
- **Introduction**: Briefly address the problem (buying expensive items) and present the solution (saving at [Brand]).
- **Headings (H2/H3)**: Scannable, keyword-rich.
- **Paragraphs**: Short (2-3 sentences max).
- **Internal Links**: Naturally include real URLs provided in the brand context (official_site, deals_url). NEVER use placeholder strings like [LINK_TRANG_BRAND].
- **Conclusion**: Final "verdict" and CTA (e.g., "Check latest deals now").

### 3. Prohibited Content & Validation
- **Source Verification**: App must fetch and read the brand's official URLs (deals_url, sale_url, official_site, coupon_page_url) before generating content.
- **Faking Codes**: If `latest_offer_status` is not 'verified' or no proof is found in source context, do NOT invent specific codes. Refer to general tips.
- **Offer Accuracy**: Use `latest_offer_summary` and `source_context` as the primary evidence. If context is empty, fallback to a neutral, evergreen review/guide.
- **News Scraping**: Do not include generic news. Only shopping-relevant info.

### 4. Semantic Intent
- **Review**: "Is [Brand] Legit?", "Quality Review 2024".
- **Guide**: "How to use [Brand] promo codes", "Stacking discounts at [Brand]".
- **Roundup**: "Best Gifts from [Brand] under $50".
- **Comparison**: "[Brand A] vs [Brand B]: Which has better sales?".

### 5. Formatting
- Use HTML blocks (UL, OL, STRONG).
- Bullet points for tips/steps.
- Clear separation between sections.

### 6. Language & Localization
- **100% English**: All articles must be written entirely in English. 
- Avoid any mixed-language output, even in instructions or placeholders.
- Use US English as the default unless specified.
