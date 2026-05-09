# CONTENT_ROTATION_RULES.md

## Rotation Logic
The goal is to provide a balanced mix of content types and avoid brand fatigue.

### 1. Default Content Type Ratios
- **50% Brand-focused blog**: Reviews, "Is it worth it?", latest promo codes.
- **20% Saving guides**: Coupon tips, auto-discount vs code, general online shopping hacks.
- **15% Product/category roundup**: "Best [Category] Under $[Price]", "Top 10 [Niche] Picks".
- **10% Seasonal/event content**: Black Friday guides, Mother's Day deals.
- **5% Comparison content**: Brand A vs. Brand B.

### 2. Constraints
- **Brand Cooldown**: Same brand cannot be picked within 48 hours or 5 consecutive posts.
- **Niche Diversity**: Ensure consecutive posts belong to different niches if possible.
- **Priority Boost**: High-priority brands are picked more frequently but still obey cooldowns.

### 3. Selection Flow
1. Determine Content Type based on probability distribution.
2. If type is `Brand-focused`, pick a high-scoring Brand using `BRAND_SYSTEM_MAP.md` logic.
3. If type is `Roundup`, pick a Niche and find 3-5 active brands within that Niche.
4. If type is `Comparison`, pick two related Brands (same niche).
5. Update `last_used_at` upon successful WordPress draft creation.
