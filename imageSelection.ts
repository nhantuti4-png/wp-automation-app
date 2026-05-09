import { Brand } from "../types";

export type ImageRole = 'featured' | 'inline_1' | 'inline_2' | 'inline_3' | 'inline_4';
export type ImageType = 'hero' | 'product' | 'lifestyle' | 'detail' | 'editorial' | 'collection' | 'promo';

export interface SelectedImages {
  featured: string;
  inline_1: string;
  inline_2: string;
  inline_3: string;
  inline_4: string;
  pattern: string;
}

export interface ImageCandidate {
  url: string;
  score: number;
  tags: string[];
  type: ImageType;
}

const PATTERNS = [
  'HERO_FIRST',
  'PRODUCT_DRIVEN',
  'EDITORIAL_MIX',
  'PROMO_CENTERED',
  'COLLECTION_VIEW'
] as const;

type PatternType = typeof PATTERNS[number];

/**
 * Detects the most likely category for an image based on its URL and metadata patterns
 */
function detectType(url: string): ImageType {
  const lower = url.toLowerCase();
  if (lower.match(/(hero|banner|home|desk|background|bg|header|intro|main)/)) return 'hero';
  if (lower.match(/(lifestyle|lookbook|model|scene|on-model|outfit|pose|action|wearing|people|person)/)) return 'lifestyle';
  if (lower.match(/(detail|close|zoom|texture|material|fabric|stitch|finish|profile|edge)/)) return 'detail';
  if (lower.match(/(editorial|campaign|look|magazine|shoot|style)/)) return 'editorial';
  if (lower.match(/(collection|category|listing|group|all|set|grid|browse)/)) return 'collection';
  if (lower.match(/(sale|promo|discount|offer|coupon|deal|percent)/)) return 'promo';
  return 'product'; // Default to product
}

/**
 * Heuristic scoring and tagging for image URLs
 */
export function scoreImage(url: string, brandSlug: string, isOgImage: boolean = false): ImageCandidate {
  const lowerUrl = url.toLowerCase();
  const type = detectType(url);
  const tags: string[] = [type];
  let score = 0;

  // 1. ROLE SCORING
  switch (type) {
    case 'lifestyle': score += 40; break; // Highest priority for human-curated feel
    case 'editorial': score += 30; break;
    case 'detail': score += 25; break;
    case 'hero': score += 15; break;
    case 'product': score += 10; break;
    case 'collection': score -= 5; break;
    case 'promo': score -= 10; break;
  }

  // 2. CONTEXT BOOSTS
  if (lowerUrl.match(/(outdoor|street|nature|room|house|garden|city)/)) score += 15;
  if (lowerUrl.match(/(wearing|outfit|pose|smile|walking)/)) score += 20;
  if (lowerUrl.includes('zoom') || lowerUrl.includes('close')) score += 5;

  // 3. NEGATIVE PENALTIES
  if (lowerUrl.match(/(logo|icon|button|graphic|arrow|dot|badge|trust|secure|payment|vimeo|youtube|social|placeholder)/)) {
    score -= 200;
  }
  if (lowerUrl.includes('banner') && !lowerUrl.includes('hero')) {
    score -= 40; // Generic skinny banners
  }
  if (lowerUrl.match(/(white-bg|flatlay|background-white)/)) {
    score -= 10; // Prefer real-world context over studio flatlays
  }
  if (isOgImage) {
    score -= 20; // og:image is often a generic site banner
  }

  // 4. BRAND RELEVANCE
  if (lowerUrl.includes(brandSlug)) score += 20;

  return { url, score, tags, type };
}

/**
 * Deduplicates similar images based on filename patterns (e.g. img_1.jpg and img_2.jpg)
 */
function deduplicateSimilar(candidates: ImageCandidate[]): ImageCandidate[] {
  const seenBases = new Set<string>();
  const result: ImageCandidate[] = [];

  for (const cand of candidates) {
    // Extract base name without numbers or extensions
    const pathParts = cand.url.split('/');
    const filename = pathParts[pathParts.length - 1] || "";
    const base = filename.replace(/\d+/g, '').replace(/\.[^/.]+$/, '').toLowerCase();
    
    if (base.length > 5 && seenBases.has(base)) continue;
    if (base.length > 5) seenBases.add(base);
    
    result.push(cand);
  }

  return result;
}

/**
 * Selects up to 5 images (1 featured, 4 inline) with forced diversity and history memory
 */
export function selectImagesByPattern(
  imageSources: string[], 
  brand: Brand, 
  lastPattern?: string,
  usedHistory: string[] = []
): SelectedImages {
  // 1. Initial Filtering
  const cleanSources = imageSources.filter(url => {
    const lower = url.toLowerCase();
    const isHttps = lower.startsWith('https://');
    const isExcluded = lower.match(/(logo|icon|picsum|blob:|data:|svg|gif|badge|payment|social)/);
    const hasValidExt = /\.(jpg|jpeg|png|webp)/i.test(url);
    return isHttps && !isExcluded && hasValidExt;
  });

  const uniqueSources = Array.from(new Set(cleanSources));
  if (uniqueSources.length === 0) {
    return { featured: "", inline_1: "", inline_2: "", inline_3: "", inline_4: "", pattern: "NONE" };
  }

  // 2. Candidate Generation & Scoring
  const ogImageUrl = uniqueSources.find(url => url.toLowerCase().includes('og_image'));
  let candidates = uniqueSources.map(url => scoreImage(url, brand.slug, url === ogImageUrl));
  
  // 3. Deduplication & History Filter
  candidates = deduplicateSimilar(candidates);
  candidates = candidates.filter(c => !usedHistory.includes(c.url));

  // If we filtered too much, try to rescue some from history but keep them last
  if (candidates.length < 5) {
    const reused = uniqueSources
      .filter(url => usedHistory.includes(url))
      .map(url => ({ ...scoreImage(url, brand.slug), score: -100 })) // Penalty for re-use
      .slice(0, 10);
    candidates = [...candidates, ...reused];
  }

  // 4. Force Diversity - Group by Type
  const groups: Record<ImageType, ImageCandidate[]> = {
    lifestyle: [], product: [], hero: [], detail: [], editorial: [], collection: [], promo: []
  };
  candidates.forEach(c => groups[c.type].push(c));

  const totalCount = candidates.length;
  const productCount = groups.product.length;
  const isLowDiversitySource = productCount / totalCount > 0.8;

  // Shuffle each group
  Object.values(groups).forEach(g => g.sort(() => Math.random() - 0.5));

  // 5. Hard Selection Logic
  const selection: string[] = [];
  const usedTypes = new Set<ImageType>();

  const pickFromGroups = (preferredTypes: ImageType[], limitByType: Partial<Record<ImageType, number>> = {}) => {
    for (const type of preferredTypes) {
      const g = groups[type];
      const limit = limitByType[type] || 99;
      const alreadyPickedOfType = Array.from(usedTypes).filter(t => t === type).length;
      
      if (alreadyPickedOfType >= limit) continue;

      const found = g.find(c => !selection.includes(c.url));
      if (found) {
        selection.push(found.url);
        usedTypes.add(type);
        return true;
      }
    }
    return false;
  };

  // Featured: Prefer Lifestyle or Hero
  // If low diversity, strictly limit products
  const featuredLimits = isLowDiversitySource ? { product: 1, hero: 1 } : {};
  if (!pickFromGroups(['lifestyle', 'hero', 'editorial'], featuredLimits)) {
    pickFromGroups(['product', 'collection'], featuredLimits);
  }

  // Inline 1-4: Force diversity
  const roleDiversityNeeds: ImageType[][] = [
    ['lifestyle', 'editorial'],
    ['product'],
    ['detail', 'lifestyle'],
    ['collection', 'hero', 'product']
  ];

  for (let i = 0; i < 4; i++) {
    const needs = roleDiversityNeeds[i] || ['product', 'detail', 'lifestyle'];
    const inlineLimits = isLowDiversitySource ? { product: 1, hero: 1 } : {};
    
    if (!pickFromGroups(needs, inlineLimits)) {
      // Fallback: pick anything left in order of quality, but still respect limits if possible
      const left = candidates
        .filter(c => !selection.includes(c.url))
        .sort((a, b) => {
           // Penalty if same type already used in low diversity mode
           if (isLowDiversitySource && usedTypes.has(a.type)) return 1;
           if (isLowDiversitySource && usedTypes.has(b.type)) return -1;
           return b.score - a.score;
        });

      if (left[0]) {
        selection.push(left[0].url);
        usedTypes.add(left[0].type);
      }
    }
  }

  // Final Safety Check: If less than 2 types, try to swap one
  if (usedTypes.size < 2 && candidates.length > 5) {
    const currentType = Array.from(usedTypes)[0];
    const differentTypeCand = candidates.find(c => c.type !== currentType);
    if (differentTypeCand) {
      selection[1] = differentTypeCand.url;
    }
  }

  // Patterns for meta purposes
  const pattern: PatternType = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

  // Ensure we have exactly 5 or fallback
  while (selection.length < 5) {
    const fallback = candidates.find(c => !selection.includes(c.url)) || candidates[0];
    selection.push(fallback?.url || "");
  }

  console.log(`[Diversity Audit] Brand: ${brand.name} | Types: ${Array.from(usedTypes).join(', ')}`);

  return {
    featured: selection[0],
    inline_1: selection[1],
    inline_2: selection[2],
    inline_3: selection[3],
    inline_4: selection[4],
    pattern
  };
}
