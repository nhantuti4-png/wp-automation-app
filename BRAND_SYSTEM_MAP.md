# BRAND_SYSTEM_MAP.md

## Brand Schema
Each brand entity must contain:
- `id`: Unique identifier.
- `name`: Brand name.
- `slug`: For URL use.
- `official_site`: Link to home.
- `deals_url`: Link to deals/promo page.
- `sale_url`: Link to clearance/sale.
- `coupon_page_url`: Link to dedicated coupons.
- `niche`: Category.
- `priority`: `high`, `medium`, `low`.
- `status`: `active` or `paused`.
- `last_checked_at`: Last automated scan.
- `latest_offer_summary`: Short text of offer.
- `latest_offer_url`: Source for AI validation.
- `latest_offer_type`: Enum of allowed discount types.
- `latest_offer_status`: `verified` or `unverified`.
- `source_verified`: Manual boolean check.
- `affiliate_url`: Main CTA link for outgoing clicks.
- `notes`: Custom info.
- `last_used_at`: Last generation.
- `use_count`: Total posts.

## Management Logic
- **Deduplication**: Check slug and name similarity before adding.
- **Filtering**: Allow filtering by niche and status in the Dashboard.
- **Priority Weights**: High priority brands should appear 3x more often than low priority in auto-rotation.
- **Active Only**: Paused brands are excluded from the `Content Strategy Engine`.

## Selection Algorithm
1. Filter `active` brands.
2. Calculate score: `(Priority + 1) / (UseCount + 1)`.
3. Select brand with the highest score that hasn't been used in the last `X` posts (where `X` is determined by niche diversity).
4. If no brand meets "last used" criteria, pick the longest-unused brand.
