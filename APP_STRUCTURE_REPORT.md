# APP_STRUCTURE_REPORT.md

## Overview
COUPON BLOG AUTO PUBLISHER is a full-stack application designed to automate high-intent blog writing for coupon/affiliate websites. It manages a brand database, implements a priority-based rotation strategy, generates content using Gemini AI, and publishes results directly to WordPress.

## Directory Structure
- `/src/`: Frontend React application.
  - `App.tsx`: Main UI entry, routing, and layout.
  - `components/`: Reusable UI components (Brand List, Generator, Settings).
  - `services/`: Frontend API clients.
- `/server.ts`: Backend Express server.
  - Handles persistence (Brand/Settings).
  - Proxies requests to WordPress REST API.
  - Implements rotation logic and content strategy engine.
- `/data/`: (Auto-created) Persistent storage for brands and settings.

## Core Modules
1. **Brand Management**: CRUD operations for brands with metadata (niche, priority, status). Includes `affiliate_url` for outgoing CTA links.
2. **Brand Detail System**: Deep data management for each brand, including automated offer scanning and verification.
3. **Content Strategy Engine**: Logic for selecting the next brand/content-type based on history and priority.
4. **AI Generator**: Prompts Gemini for blog content based on a **fixed 6-Form Pattern System** (Article Review, Sale Guide, Shopping Guide, etc.). Each generation strictly follows a `formId` mapping to a required structure, tone, and CTA strategy defined in `/src/services/articlePatterns.ts`. Implements a **Multi-Point CTA Strategy** (3-5 CTAs per article) with prioritized mapping: Affiliate (primary), Official (fallback), and Internal (contextual). Includes an automated anti-repeat mechanism for content structures and intros.
5. **WordPress Integration**: Securely manages WP credentials and performs REST API operations (Post, Media).
6. **Rotation & History**: Tracks what has been published to avoid duplication.
7. **Image Management**: Handles selection strategy (Library, Official, Stock, AI Fallback) and caching of image metadata.

## Data Flow
1. **Selection**: User starts the generation process for a selected Brand.
2. **Automated Crawling (Optimized)**: System crawls official brand URLs (Official Site, Deals, Sale). Note: Internal coupon pages are EXCLUDED from crawl to prevent host branding leakage.
3. **Smart Image Selection**: System extracts and scores images from official sources, prioritizing hero/banner images and filtering out site logos/icons.
4. **Data Extraction**: Gemini extracts verified offers from the official context. 
5. **AI Generation**: Gemini generates the article using real-time official context to ensure accuracy.
6. **Publish**: Formatted HTML is sent to WordPress as a Draft.

## Prohibited Modifications
- Do not modify non-blog related modules (e.g., trying to integrate with WooCommerce or Coupon plugins).
- Do not bypass the "Draft" default status for WordPress publishing.
- Do not change the priority-based selection logic without consulting `BRAND_SYSTEM_MAP.md`.
