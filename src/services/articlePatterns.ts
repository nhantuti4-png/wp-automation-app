export interface ArticleForm {
  formId: string;
  formName: string;
  articleType: string;
  bestUseCase: string;
  titlePatterns: string[];
  introStyles: string[];
  requiredSections: {
    heading: string;
    description: string;
    keyPoints?: string[];
  }[];
  optionalSections: string[];
  ctaPositions: string[];
  ctaStyles: string[];
  toneProfiles: string[];
  closingStyles: string[];
  antiRepeatRules: string[];
}

export const ARTICLE_FORMS: ArticleForm[] = [
  {
    formId: "review_story",
    formName: "Review Story (Lifestyle)",
    articleType: "Review",
    bestUseCase: "Deep personal-style review with lifestyle context and natural product integration.",
    titlePatterns: [
      "My Honest Experience with [Brand]: Is it Worth the Hype?",
      "The [Brand] Review: How it Actually Fits into My Daily Routine",
      "Style & Comfort: Why I Keep Coming Back to [Brand]"
    ],
    introStyles: [
      "I finally got my hands on some pieces from [Brand], and honestly? I have some thoughts.",
      "If you've been seeing [Brand] all over your feed lately, you're probably wondering the same thing I was: is it actually good?",
      "Lately, I’ve been looking for better [Niche] options, and [Brand] has been at the top of my list to try."
    ],
    requiredSections: [
      { heading: "Living with [Brand]", description: "Personal storytelling about using or wearing the products in real life." },
      { heading: "The Fit and Feel", description: "Detailed description of materials, comfort, and how it feels when worn." },
      { heading: "Is it Worth the Investment?", description: "Discussion on price, quality, and overall value proposition." },
      { heading: "Current Favorites & Deals", description: "Natural mention of current favorite items and available discounts." }
    ],
    optionalSections: ["Sizing Tips", "How I Styled It", "Comparison to Other Brands"],
    ctaPositions: ["Mid-story", "After value discussion", "Final takeaway"],
    ctaStyles: ["Check Latest Price", "Browse the Collection", "View Current Deals"],
    toneProfiles: ["Natural", "Human", "Lifestyle-focused"],
    closingStyles: ["Final thoughts on who this is perfect for.", "A friendly sign-off encouraging readers to check it out."],
    antiRepeatRules: ["No clinical or robotic descriptions", "Avoid generic 'excellent quality' without context"]
  },
  {
    formId: "sale_first_guide",
    formName: "Sale-First Shopping Guide",
    articleType: "Guide",
    bestUseCase: "Focusing strictly on maximizing savings during active or upcoming sales.",
    titlePatterns: [
      "Current Sales: How to Save at [Brand] Right Now",
      "Savings Guide: Using Codes and Deals at [Brand]",
      "The [Brand] Savings Guide: When to Buy"
    ],
    introStyles: [
      "A look at the current offers and verified discount codes at [Brand].",
      "Checking for the best deals in the active [Brand] clearance section.",
      "Ways to find a lower price on [Brand] orders this week."
    ],
    requiredSections: [
      { heading: "Current Deals", description: "The best ways to save on the official site right now." },
      { heading: "Using Promo Codes", description: "Tips for applying codes and getting free shipping." },
      { heading: "Good Finds in the Sale Section", description: "Highlighting items that look like a good deal in clearance." }
    ],
    optionalSections: ["Newsletter Signup Bonus", "Student Discount Integration", "App-Only Exclusives"],
    ctaPositions: ["Top of article", "After each deal breakdown", "Final summary"],
    ctaStyles: ["Grab the Discount Now", "Shop the Sale Section", "Reveal My Promo Code"],
    toneProfiles: ["Energetic", "Urgent", "Value-Driven"],
    closingStyles: ["Don't wait—these deals expire soon.", "Share your savings with us in the comments."],
    antiRepeatRules: ["Avoid generic 'shop till you drop' talk", "Every CTA must use the primary affiliate link"]
  },
  {
    formId: "worth_buying",
    formName: "Is It Worth Buying",
    articleType: "Review",
    bestUseCase: "Deep dive into high-ticket items or popular viral products.",
    titlePatterns: [
      "Is [Brand] Worth It? Quality vs. Price",
      "Buying from [Brand]: What You Actually Get",
      "Things to Know Before Your Next [Brand] Order"
    ],
    introStyles: [
      "Checking if the current interest in [Brand] matches the actual product quality.",
      "Looking at the value and durability of popular [Brand] items.",
      "What to consider before you place an order at [Brand]."
    ],
    requiredSections: [
      { heading: "Quality and Value", description: "Comparing the brand's claims with actual product standards." },
      { heading: "How Items Usually Last", description: "A look at durability and general wear." },
      { heading: "Other Options to Consider", description: "Looking at similar brands in the same price range." }
    ],
    optionalSections: ["Unboxing Experience", "Maintenance Tips", "Resale Value Information"],
    ctaPositions: ["After reality check", "Inside durability section", "Conclusion verdict"],
    ctaStyles: ["Get the Best Price", "Check Official Sizing", "See Current Inventory"],
    toneProfiles: ["Critical", "Skeptical", "Fair-mindedly Honest"],
    closingStyles: ["Final 'Yes/No' recommendation.", "Alternative product suggestions if the answer is No."],
    antiRepeatRules: ["Strictly forbidden to use 'offers something for everyone'", "Must mention specific material data"]
  },
  {
    formId: "best_categories",
    formName: "Best Categories to Check",
    articleType: "Category Roundup",
    bestUseCase: "Curated lists of the best performing niches within the brand.",
    titlePatterns: [
      "Popular Items at [Brand]: Top Categories",
      "Best Sellers at [Brand]: What to Buy",
      "Guide: Most Popular Sections at [Brand]"
    ],
    introStyles: [
      "Looking at the products at [Brand] to find the current highlights.",
      "A shortlist for anyone browsing the [Brand] catalog.",
      "Why [Brand] is popular in these specific categories."
    ],
    requiredSections: [
      { heading: "What Stands Out", description: "Focus on the main category that people know the brand for." },
      { heading: "Other Good Finds", description: "Useful categories that offer decent quality for the price." },
      { heading: "Practical Tips", description: "Things to keep in mind about sizing or specific sections." }
    ],
    optionalSections: ["Best Sellers List", "New Arrivals Filter", "Gift Ideas by Category"],
    ctaPositions: ["After each category highlight", "Mid-article summary", "End of post"],
    ctaStyles: ["Browse This Section", "See Best Sellers", "View The Collection"],
    toneProfiles: ["Curated", "Sophisticated", "Selective"],
    closingStyles: ["Start with these categories to see what the brand does best.", "Check the latest items in these sections."],
    antiRepeatRules: ["No 'great choice' generic language", "Must use variation in category naming"]
  },
  {
    formId: "comp_better_than",
    formName: "Comparison / Better Than Alternatives",
    articleType: "Comparison",
    bestUseCase: "Competing against market leaders or similar brands.",
    titlePatterns: [
      "Shopping at [Brand] vs. Alternatives: A Comparison",
      "Choosing Between [Alternative] and [Brand]",
      "The Comparison: [Brand] vs. [Other Brand]"
    ],
    introStyles: [
      "A head-to-head comparison between [Brand] and recent alternatives.",
      "Checking the quality and price differences between [Brand] and [Alternative].",
      "What sets [Brand] apart from other brands in the [Niche] market today."
    ],
    requiredSections: [
      { heading: "The Main Differences", description: "A side-by-side look at features and materials." },
      { heading: "Which Offers Better Value?", description: "Comparing price points and overall quality." },
      { heading: "What Makes [Brand] Different", description: "The specific features that set this brand apart." }
    ],
    optionalSections: ["Shipping Policy Comparison", "Customer Support Battle", "Sustainability Comparison"],
    ctaPositions: ["After each comparison point", "Winner section", "Final verdict"],
    ctaStyles: ["Shop the Winner", "Compare Latest Prices", "Get My Exclusive Link"],
    toneProfiles: ["Comparative", "Competitive", "Unbiased"],
    closingStyles: ["Summary of who should choose which brand.", "Final recommendation based on usage scenario."],
    antiRepeatRules: ["No 'ultimate experience' fluff", "Must cite specific data points for each brand"]
  },
  {
    formId: "new_customer_guide",
    formName: "New Customer Buying Guide",
    articleType: "Onboarding",
    bestUseCase: "Perfect for first-time shoppers who need a roadmap.",
    titlePatterns: [
      "First Time Shopping at [Brand]? Read This 101 Guide",
      "Maximizing Your First [Brand] Order: Codes, Sizing & Shipping",
      "The Newcomer's Cheat Sheet to Buying From [Brand]"
    ],
    introStyles: [
      "A guide for anyone placing their first order at [Brand].",
      "Common tips for new shoppers at [Brand] to avoid ordering mistakes.",
      "How to use available discounts on a first-time [Brand] purchase."
    ],
    requiredSections: [
      { heading: "Welcome Discount Secrets", description: "How to find and apply the specific 'New Customer' codes." },
      { heading: "Sizing & Fit Accuracy", description: "How to order correctly the first time to avoid returns." },
      { heading: "First Order Checklist", description: "Step-by-step guide from account creation to tracking your package." }
    ],
    optionalSections: ["Newsletter Benefits", "Returns Policy for New Users", "Loyalty Program Early Start"],
    ctaPositions: ["After welcome code section", "Inside sizing guide", "Conclusion"],
    ctaStyles: ["Join as a New Member", "Grab My First Order Deal", "Start Shopping Now"],
    toneProfiles: ["Welcoming", "Instructive", "Trust-Building"],
    closingStyles: ["Ready for your first order? Use these tips.", "Welcome to the [Brand] community."],
    antiRepeatRules: ["Must not sound like a manual", "Focus on saving money immediately"]
  }
];
