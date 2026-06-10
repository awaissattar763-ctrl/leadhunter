import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function crawlWebsite(url: string) {
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  const res = await fetch(normalized, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Cannot fetch ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title = $("title").text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || $('meta[property="og:description"]').attr("content")?.trim() || "";
  const metaKeywords = $('meta[name="keywords"]').attr("content")?.trim() || "";
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || "";
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || "";

  const h1s: string[] = [];
  $("h1").each((_, el) => { const t = $(el).text().trim(); if (t) h1s.push(t); });
  const h2s: string[] = [];
  $("h2").each((_, el) => { const t = $(el).text().trim(); if (t) h2s.push(t); });
  const h3s: string[] = [];
  $("h3").each((_, el) => { const t = $(el).text().trim(); if (t) h3s.push(t.slice(0, 100)); });

  const navItems: string[] = [];
  $("nav a, header a").each((_, el) => { const t = $(el).text().trim(); if (t && t.length < 50) navItems.push(t); });

  const ctaButtons: string[] = [];
  $("button, .btn, .button, [class*='cta'], a[class*='btn'], a[class*='button']").each((_, el) => {
    const t = $(el).text().trim(); if (t && t.length < 80) ctaButtons.push(t);
  });

  const pageText = $("body").text();
  const phoneMatches = pageText.match(/(\+?[\d\s\-\(\)]{7,20})/g) || [];
  const phones = [...new Set(phoneMatches.filter(p => p.replace(/\D/g, "").length >= 7).slice(0, 5))];
  const emailMatches = pageText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  const emails = [...new Set(emailMatches.slice(0, 5))];

  const waLinks: string[] = [];
  $("a[href*='wa.me'], a[href*='whatsapp'], a[href*='api.whatsapp']").each((_, el) => {
    const href = $(el).attr("href") || ""; if (href) waLinks.push(href);
  });
  const hasWhatsApp = waLinks.length > 0 || pageText.toLowerCase().includes("whatsapp");

  const forms: { action: string; inputs: string[] }[] = [];
  $("form").each((_, form) => {
    const action = $(form).attr("action") || "";
    const inputs: string[] = [];
    $(form).find("input, select, textarea").each((_, inp) => {
      const name = $(inp).attr("name") || $(inp).attr("placeholder") || $(inp).attr("type") || "";
      if (name) inputs.push(name);
    });
    forms.push({ action, inputs });
  });
  const hasBookingForm = forms.some(f =>
    f.inputs.some(i => /name|email|phone|date|time|book|appoint|message/i.test(i)) ||
    /book|appoint|reserv|schedul/i.test(f.action)
  );

  const images: { src: string; alt: string }[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") || ""; const alt = $(el).attr("alt") || "";
    if (src) images.push({ src: src.slice(0, 150), alt: alt.slice(0, 100) });
  });
  const imagesWithoutAlt = images.filter(i => !i.alt).length;

  const socialLinks: string[] = [];
  $("a[href*='facebook'], a[href*='instagram'], a[href*='twitter'], a[href*='linkedin'], a[href*='youtube'], a[href*='tiktok']").each((_, el) => {
    const href = $(el).attr("href") || ""; if (href) socialLinks.push(href);
  });

  const bodyText = pageText.replace(/\s+/g, " ").trim().slice(0, 4000);
  const hasViewport = !!$('meta[name="viewport"]').length;
  const scriptCount = $("script").length;
  const hasSchema = html.includes("application/ld+json");
  const hasChatWidget = ["intercom", "tawk", "zendesk", "crisp", "tidio", "drift"].some(w => html.toLowerCase().includes(w));
  const hasGoogleAnalytics = html.includes("gtag") || html.includes("analytics");
  const hasSSL = normalized.startsWith("https");

  // Industry keyword detection
  const fullText = (title + " " + bodyText).toLowerCase();
  const industryKeywords = {
    healthcare: ["clinic", "hospital", "doctor", "patient", "medical", "health", "physician", "surgery"],
    physiotherapy: ["physiotherapy", "physiotherapist", "physio", "rehabilitation", "rehab", "stroke", "orthopedic", "dpt"],
    dental: ["dental", "dentist", "teeth", "tooth", "orthodont", "crown", "implant"],
    restaurant: ["restaurant", "food", "menu", "dining", "cuisine", "chef", "eat", "order", "delivery"],
    realestate: ["real estate", "property", "apartment", "house", "rent", "buy home", "plot", "commercial"],
    education: ["school", "college", "university", "academy", "institute", "course", "training", "tuition"],
    legal: ["law firm", "lawyer", "attorney", "legal", "advocate", "court", "litigation", "barrister"],
    ecommerce: ["shop", "store", "cart", "buy now", "product", "checkout", "ecommerce", "order now"],
    beauty: ["salon", "spa", "beauty", "hair", "makeup", "skincare", "nail"],
  };
  let detectedIndustry = "General Business";
  let maxScore = 0;
  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    const score = keywords.filter(k => fullText.includes(k)).length;
    if (score > maxScore) { maxScore = score; detectedIndustry = industry; }
  }

  return {
    url: normalized, title, metaDescription, metaKeywords, ogTitle, canonical,
    h1s, h2s, h3s: h3s.slice(0, 10), navItems: [...new Set(navItems)].slice(0, 20),
    ctaButtons: [...new Set(ctaButtons)].slice(0, 15), phones, emails,
    hasWhatsApp, waLinks, forms, hasBookingForm,
    images: images.slice(0, 10), imagesWithoutAlt, totalImages: images.length,
    socialLinks: [...new Set(socialLinks)].slice(0, 8),
    bodyText, hasViewport, scriptCount, hasSchema, hasChatWidget,
    hasGoogleAnalytics, hasSSL, detectedIndustry,
  };
}

async function analyzeWithGroq(crawlData: Record<string, unknown>) {
  const prompt = `You are a senior agency consultant and digital strategist. Analyze this REAL website crawl data and return a comprehensive agency prospecting report.

REAL CRAWLED DATA:
URL: ${crawlData.url}
Title: ${crawlData.title}
Meta Description: ${crawlData.metaDescription}
Industry Detected: ${crawlData.detectedIndustry}
H1s: ${JSON.stringify(crawlData.h1s)}
H2s: ${JSON.stringify(crawlData.h2s)}
Nav Items: ${JSON.stringify(crawlData.navItems)}
CTA Buttons: ${JSON.stringify(crawlData.ctaButtons)}
Phones: ${JSON.stringify(crawlData.phones)}
Emails: ${JSON.stringify(crawlData.emails)}
Has WhatsApp: ${crawlData.hasWhatsApp} | WA Links: ${JSON.stringify(crawlData.waLinks)}
Has Booking Form: ${crawlData.hasBookingForm}
Has Schema Markup: ${crawlData.hasSchema}
Has Live Chat: ${crawlData.hasChatWidget}
Has Google Analytics: ${crawlData.hasGoogleAnalytics}
Has SSL: ${crawlData.hasSSL}
Has Mobile Viewport: ${crawlData.hasViewport}
Images Without Alt: ${crawlData.imagesWithoutAlt} of ${crawlData.totalImages}
Social Links: ${JSON.stringify(crawlData.socialLinks)}
Page Content: ${crawlData.bodyText}

Return ONLY a JSON object (no markdown, no backticks, no explanation) with this exact structure:

{
  "businessName": "extracted or inferred business name",
  "businessType": "specific type",
  "industry": "one of: Healthcare, Physiotherapy, Dental, Restaurant, Real Estate, Education, Legal, E-commerce, Beauty, General Business",
  "isHealthcare": true/false,

  "scores": {
    "websiteQuality": <0-100 based on design signals, meta, structure>,
    "seo": <0-100 based on title, meta, schema, alt texts, h1s>,
    "conversion": <0-100 based on CTAs, forms, booking, WhatsApp>,
    "automation": <0-100 based on chat, CRM signals, analytics, automation tools>,
    "overall": <weighted average>
  },

  "opportunityLevel": "Low|Medium|High",

  "estimatedProjectValue": {
    "websiteUpgrade": { "min": <PKR number>, "max": <PKR number>, "reason": "reason" },
    "aiChatbot": { "min": <PKR number>, "max": <PKR number>, "reason": "reason" },
    "crmSystem": { "min": <PKR number>, "max": <PKR number>, "reason": "reason" },
    "whatsappAutomation": { "min": <PKR number>, "max": <PKR number>, "reason": "reason" },
    "totalMin": <sum of mins>,
    "totalMax": <sum of maxes>
  },

  "outreach": {
    "whatsapp": "personalized WhatsApp message using real findings, 3-4 sentences, casual professional tone, mention specific gaps found",
    "email": { "subject": "compelling subject line", "body": "personalized email pitch 4-5 sentences using real audit findings" },
    "linkedin": "personalized LinkedIn connection message 2-3 sentences"
  },

  "competitorGaps": [
    { "gap": "gap name", "present": true/false, "impact": "business impact description", "severity": "Critical|High|Medium|Low" }
  ],

  "executiveSummary": {
    "top3Problems": ["specific problem 1 from real data", "problem 2", "problem 3"],
    "top3QuickWins": ["quick win 1", "quick win 2", "quick win 3"],
    "top3RevenueOpportunities": ["opportunity 1", "opportunity 2", "opportunity 3"]
  },

  "seoFindings": { "score": <0-100>, "issues": ["issue based on real data"], "opportunities": ["opportunity"] },
  "uxFindings": { "score": <0-100>, "issues": ["issue"], "opportunities": ["opportunity"] },
  "conversionFindings": { "score": <0-100>, "issues": ["issue"], "opportunities": ["opportunity"] },

  "aiAutomationOpportunities": [
    { "title": "title", "description": "specific description", "impact": "High|Medium|Low", "estimatedValue": "value proposition" }
  ],

  "recommendedServices": [
    { "service": "service", "reason": "reason from audit", "priority": "High|Medium|Low", "estimatedPrice": "PKR range" }
  ],

  "healthcareRecommendations": ${crawlData.detectedIndustry === 'physiotherapy' || crawlData.detectedIndustry === 'healthcare' || crawlData.detectedIndustry === 'dental' ? `[
    { "feature": "feature name", "description": "description", "impact": "High|Medium|Low" }
  ]` : 'null'},

  "keyInsights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "competitiveWeaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "quickWins": ["win 1", "win 2", "win 3"]
}`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const crawlData = await crawlWebsite(url);
    const analysis = await analyzeWithGroq(crawlData as Record<string, unknown>);
    return NextResponse.json({ success: true, crawlData, analysis, auditedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
