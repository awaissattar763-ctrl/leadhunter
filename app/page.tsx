"use client";
import { useState, useEffect } from "react";
import { getLeads, saveLead, updateLeadStatus, deleteLead, formatPKR, type CRMLead } from "@/lib/crm-store";

// ─── Types ────────────────────────────────────────────────────────
type Scores = { websiteQuality: number; seo: number; conversion: number; automation: number; overall: number };
type ValueItem = { min: number; max: number; reason: string };
type Analysis = {
  businessName: string; businessType: string; industry: string; isHealthcare: boolean;
  scores: Scores; opportunityLevel: "Low" | "Medium" | "High";
  estimatedProjectValue: { websiteUpgrade: ValueItem; aiChatbot: ValueItem; crmSystem: ValueItem; whatsappAutomation: ValueItem; totalMin: number; totalMax: number };
  outreach: { whatsapp: string; email: { subject: string; body: string }; linkedin: string };
  competitorGaps: { gap: string; present: boolean; impact: string; severity: string }[];
  executiveSummary: { top3Problems: string[]; top3QuickWins: string[]; top3RevenueOpportunities: string[] };
  seoFindings: { score: number; issues: string[]; opportunities: string[] };
  uxFindings: { score: number; issues: string[]; opportunities: string[] };
  conversionFindings: { score: number; issues: string[]; opportunities: string[] };
  aiAutomationOpportunities: { title: string; description: string; impact: string; estimatedValue: string }[];
  recommendedServices: { service: string; reason: string; priority: string; estimatedPrice: string }[];
  healthcareRecommendations?: { feature: string; description: string; impact: string }[];
  keyInsights: string[]; competitiveWeaknesses: string[]; quickWins: string[];
};
type CrawlData = {
  url: string; title: string; metaDescription: string; h1s: string[]; h2s: string[];
  phones: string[]; emails: string[]; hasWhatsApp: boolean; hasBookingForm: boolean;
  hasSchema: boolean; hasChatWidget: boolean; hasViewport: boolean; hasGoogleAnalytics: boolean;
  hasSSL: boolean; imagesWithoutAlt: number; totalImages: number; socialLinks: string[];
  navItems: string[]; ctaButtons: string[]; detectedIndustry: string;
};
type AuditResult = { crawlData: CrawlData; analysis: Analysis; auditedAt: string };

// ─── Constants ────────────────────────────────────────────────────
const OPP_COLORS = {
  High: { bg: "rgba(239,68,68,0.1)", text: "#EF4444", border: "rgba(239,68,68,0.3)" },
  Medium: { bg: "rgba(245,158,11,0.1)", text: "#F59E0B", border: "rgba(245,158,11,0.3)" },
  Low: { bg: "rgba(34,197,94,0.1)", text: "#22C55E", border: "rgba(34,197,94,0.3)" },
};
const SEV_COLORS: Record<string, string> = { Critical: "#EF4444", High: "#F97316", Medium: "#F59E0B", Low: "#22C55E" };
const STATUS_COLORS: Record<string, string> = {
  "Not Contacted": "#637B96", "WhatsApp Sent": "#25D366", "Email Sent": "#4A90E2",
  "In Negotiation": "#F59E0B", "Closed Won": "#22C55E", "Closed Lost": "#EF4444",
};

// ─── Small components ─────────────────────────────────────────────
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 10) / 2; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#00C8A8" : score >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s ease" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="700"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>{score}</text>
    </svg>
  );
}

function ScoreBar({ label, value, desc }: { label: string; value: number; desc?: string }) {
  const color = value >= 70 ? "#00C8A8" : value >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{label}</span>
          {desc && <span style={{ fontSize: 11, color: "#637B96", marginLeft: 8 }}>{desc}</span>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}/100</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width 1.2s ease" }} />
      </div>
    </div>
  );
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#0B1A2E", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px", ...style }}>{children}</div>;
}

function SectionTitle({ label, icon }: { label: string; icon: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>{label}</h2>
    </div>
  );
}

function Tag({ children, color = "#00C8A8" }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }}>{children}</span>;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      style={{ background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: copied ? "#22C55E" : "#637B96", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────
const TABS = ["Overview", "Scores", "Outreach", "Gaps", "Services", "Healthcare", "Raw Data"];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [view, setView] = useState<"audit" | "crm">("audit");
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => { setLeads(getLeads()); }, [view]);

  const LOAD_STEPS = [
    "Fetching live website...", "Parsing HTML structure...", "Extracting SEO signals...",
    "Analyzing conversion elements...", "Detecting industry...", "Running Groq AI analysis...",
    "Calculating opportunity scores...", "Generating outreach templates...", "Building full report...",
  ];

  async function runAudit() {
    if (!url.trim()) return;
    setLoading(true); setResult(null); setError(""); setActiveTab("Overview");
    let si = 0; setLoadStep(LOAD_STEPS[0]);
    const iv = setInterval(() => { si = Math.min(si + 1, LOAD_STEPS.length - 1); setLoadStep(LOAD_STEPS[si]); }, 1800);
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const data = await res.json();
      clearInterval(iv);
      if (!res.ok) { setError(data.error || "Audit failed"); } else { setResult(data); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Network error"); }
    finally { clearInterval(iv); setLoading(false); }
  }

  function saveTocrm() {
    if (!result) return;
    const lead: CRMLead = {
      id: Date.now().toString(),
      businessName: result.analysis.businessName || result.crawlData.title || result.crawlData.url,
      website: result.crawlData.url,
      phones: result.crawlData.phones,
      emails: result.crawlData.emails,
      industry: result.analysis.industry || result.crawlData.detectedIndustry,
      auditDate: result.auditedAt,
      opportunityScore: result.analysis.scores.overall,
      opportunityLevel: result.analysis.opportunityLevel,
      estimatedValueMin: result.analysis.estimatedProjectValue?.totalMin || 0,
      estimatedValueMax: result.analysis.estimatedProjectValue?.totalMax || 0,
      outreachStatus: "Not Contacted",
      notes: "",
    };
    saveLead(lead);
    setLeads(getLeads());
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  }

  async function handleExportPDF() {
    if (!result) return;
    const { exportAuditPDF } = await import("@/lib/pdf-export");
    await exportAuditPDF({ analysis: result.analysis as unknown as Record<string, unknown>, crawlData: result.crawlData as unknown as Record<string, unknown>, auditedAt: result.auditedAt });
  }

  const opp = result?.analysis?.opportunityLevel;
  const oppStyle = opp ? OPP_COLORS[opp] : OPP_COLORS.Medium;

  // ─── NAV ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', -apple-system, sans-serif", background: "#05101F", color: "#E8F0F8" }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes progress { 0% { width: 8%; } 50% { width: 75%; } 100% { width: 8%; } }
        .tab-btn { background: transparent; border: none; cursor: pointer; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; transition: all 0.15s; font-family: inherit; color: rgba(255,255,255,0.45); white-space: nowrap; }
        .tab-btn:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.04); }
        .tab-btn.active { color: #00C8A8; background: rgba(0,200,168,0.1); }
        .view-btn { background: transparent; border: none; cursor: pointer; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; transition: all 0.15s; font-family: inherit; }
        .input-field { background: transparent; border: none; outline: none; color: #E8F0F8; font-size: 15px; padding: 10px 12px; font-family: inherit; width: 100%; }
        textarea { resize: vertical; font-family: inherit; }
        select { cursor: pointer; font-family: inherit; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(5,16,31,0.95)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#00C8A8,#0060FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎯</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>Lead<span style={{ color: "#00C8A8" }}>Hunter</span> AI</div>
            <div style={{ fontSize: 10, color: "#637B96" }}>Agency Prospecting Platform</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="view-btn" onClick={() => setView("audit")} style={{ color: view === "audit" ? "#00C8A8" : "rgba(255,255,255,0.5)", background: view === "audit" ? "rgba(0,200,168,0.1)" : "transparent" }}>🔍 Auditor</button>
          <button className="view-btn" onClick={() => { setView("crm"); setLeads(getLeads()); }} style={{ color: view === "crm" ? "#F59E0B" : "rgba(255,255,255,0.5)", background: view === "crm" ? "rgba(245,158,11,0.1)" : "transparent" }}>📋 Lead CRM {leads.length > 0 && <span style={{ background: "#F59E0B", color: "#05101F", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{leads.length}</span>}</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tag color="#00C8A8">Real Crawl</Tag>
          <Tag color="#8B5CF6">Groq AI</Tag>
          <Tag color="#F59E0B">Agency Tool</Tag>
        </div>
      </nav>

      {/* TOAST */}
      {savedToast && <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "#22C55E", color: "#fff", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.4)", animation: "fadeIn 0.3s ease" }}>✓ Saved to Lead CRM!</div>}

      {/* ─── CRM VIEW ─── */}
      {view === "crm" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800 }}>📋 Lead CRM</h1>
              <p style={{ fontSize: 13, color: "#637B96", marginTop: 4 }}>{leads.length} leads saved · Track outreach status & estimated values</p>
            </div>
            {leads.length > 0 && (
              <button onClick={async () => { const { exportLeadsCsv } = await import("@/lib/pdf-export"); exportLeadsCsv(leads); }}
                style={{ background: "rgba(0,200,168,0.1)", border: "1px solid rgba(0,200,168,0.3)", color: "#00C8A8", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ↓ Export CSV
              </button>
            )}
          </div>

          {leads.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No leads saved yet</p>
              <p style={{ color: "#637B96", fontSize: 14 }}>Run an audit and click "Save to CRM" to track your prospects.</p>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {leads.map(lead => (
                <Card key={lead.id} style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{lead.businessName}</span>
                        <Tag color={OPP_COLORS[lead.opportunityLevel].text}>{lead.opportunityLevel} Opp.</Tag>
                        <Tag color="#8B5CF6">{lead.industry}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: "#637B96", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>🌐 {lead.website}</span>
                        {lead.phones[0] && <span>📞 {lead.phones[0]}</span>}
                        {lead.emails[0] && <span>✉ {lead.emails[0]}</span>}
                        <span>📅 {new Date(lead.auditDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 80 }}>
                      <ScoreRing score={lead.opportunityScore} size={52} />
                      <p style={{ fontSize: 10, color: "#637B96", marginTop: 3 }}>Score</p>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 120 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#00C8A8" }}>{formatPKR(lead.estimatedValueMin)} — {formatPKR(lead.estimatedValueMax)}</div>
                      <p style={{ fontSize: 10, color: "#637B96", marginTop: 2 }}>Est. Value</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
                      <select value={lead.outreachStatus}
                        onChange={e => { updateLeadStatus(lead.id, e.target.value as CRMLead["outreachStatus"]); setLeads(getLeads()); }}
                        style={{ background: "#0F2040", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, color: STATUS_COLORS[lead.outreachStatus] || "#637B96", outline: "none" }}>
                        {["Not Contacted", "WhatsApp Sent", "Email Sent", "In Negotiation", "Closed Won", "Closed Lost"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditingNote(editingNote === lead.id ? null : lead.id); setNoteText(lead.notes); }}
                          style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#637B96", borderRadius: 6, padding: "5px 0", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          📝 Notes
                        </button>
                        <button onClick={() => { deleteLead(lead.id); setLeads(getLeads()); }}
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#EF4444", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                  {editingNote === lead.id && (
                    <div style={{ marginTop: 12, animation: "fadeIn 0.2s ease" }}>
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
                        placeholder="Add notes about this lead..."
                        style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8F0F8", outline: "none" }} />
                      <button onClick={() => { updateLeadStatus(lead.id, lead.outreachStatus, noteText); setLeads(getLeads()); setEditingNote(null); }}
                        style={{ marginTop: 6, background: "rgba(0,200,168,0.1)", border: "1px solid rgba(0,200,168,0.2)", color: "#00C8A8", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Save Note
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIT VIEW ─── */}
      {view === "audit" && (
        <>
          {/* HERO */}
          {!result && !loading && (
            <section style={{ padding: "60px 20px 40px", textAlign: "center", maxWidth: 780, margin: "0 auto" }}>
              <div style={{ marginBottom: 14 }}><Tag color="#F59E0B">🔥 Real-Time Agency Prospecting Intelligence</Tag></div>
              <h1 style={{ fontSize: "clamp(30px,5vw,52px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, marginBottom: 14 }}>
                Turn Any Website Into<br /><span style={{ color: "#00C8A8" }}>A Sales Opportunity</span>
              </h1>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 36, maxWidth: 520, margin: "0 auto 36px" }}>
                Real crawl engine. Groq AI analysis. Personalized outreach. Instant PDF reports. Built for agencies who sell web, AI, and automation services.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
                {["✓ Real website crawl", "✓ Industry detection", "✓ Outreach generator", "✓ PDF export", "✓ Lead CRM", "✓ Healthcare mode"].map(f => (
                  <span key={f} style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "4px 12px" }}>{f}</span>
                ))}
              </div>
            </section>
          )}

          {/* SEARCH BAR */}
          <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 20px 32px" }}>
            <div style={{ background: "#0B1A2E", border: `1px solid ${loading ? "rgba(0,200,168,0.5)" : "rgba(0,200,168,0.25)"}`, borderRadius: 14, padding: 8, display: "flex", gap: 8, transition: "border-color 0.3s" }}>
              <input className="input-field" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && runAudit()}
                placeholder="Enter any website URL — e.g. drexample.pk or https://clinic.com" />
              <button onClick={runAudit} disabled={loading || !url.trim()}
                style={{ background: loading ? "rgba(0,200,168,0.35)" : "#00C8A8", color: "#05101F", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap", transition: "all 0.2s", fontFamily: "inherit" }}>
                {loading ? "⏳ Auditing..." : "🔍 Run Audit"}
              </button>
            </div>
          </div>

          {/* LOADING */}
          {loading && (
            <div style={{ maxWidth: 580, margin: "0 auto 40px", padding: "0 20px" }}>
              <Card style={{ textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(0,200,168,0.15)", borderTop: "3px solid #00C8A8", animation: "spin 0.85s linear infinite", margin: "0 auto 16px" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "#00C8A8", marginBottom: 6 }}>{loadStep}</p>
                <p style={{ fontSize: 12, color: "#637B96" }}>Crawling real data — please wait ~20 seconds</p>
                <div style={{ marginTop: 16, background: "rgba(0,200,168,0.06)", borderRadius: 8, height: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#00C8A8", borderRadius: 8, animation: "progress 2.2s ease-in-out infinite" }} />
                </div>
              </Card>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ maxWidth: 580, margin: "0 auto 40px", padding: "0 20px" }}>
              <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "18px 22px" }}>
                <p style={{ color: "#EF4444", fontWeight: 600, marginBottom: 4 }}>Audit Failed</p>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>{error}</p>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>Try adding https:// prefix or check if the site is publicly accessible.</p>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {result && (
            <div style={{ maxWidth: 1150, margin: "0 auto", padding: "0 20px 80px", animation: "fadeIn 0.4s ease" }}>
              {/* HEADER CARD */}
              <Card style={{ background: "linear-gradient(135deg,#0B1A2E,#0F2040)", border: "1px solid rgba(0,200,168,0.2)", marginBottom: 18 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <Tag color="#00C8A8">{result.analysis.industry || result.crawlData.detectedIndustry}</Tag>
                      {result.analysis.isHealthcare && <Tag color="#EC4899">🏥 Healthcare Mode</Tag>}
                      <Tag color="#637B96">Audited {new Date(result.auditedAt).toLocaleString()}</Tag>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>{result.analysis.businessName || result.crawlData.title}</h2>
                    <p style={{ fontSize: 12, color: "#637B96" }}>{result.analysis.businessType} · {result.crawlData.url}</p>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginTop: 10, maxWidth: 560 }}>{(result.analysis as Record<string, unknown>).executiveSummary && typeof (result.analysis as Record<string, unknown>).executiveSummary === "object" ? (result.analysis.executiveSummary?.top3Problems?.[0] || "") : ""}</p>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <ScoreRing score={result.analysis.scores.overall} size={84} />
                      <p style={{ fontSize: 10, color: "#637B96", marginTop: 4 }}>Overall Score</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ background: oppStyle.bg, border: `1px solid ${oppStyle.border}`, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>OPPORTUNITY</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: oppStyle.text }}>{result.analysis.opportunityLevel}</p>
                      </div>
                      {result.analysis.estimatedProjectValue && (
                        <div style={{ background: "rgba(0,200,168,0.06)", border: "1px solid rgba(0,200,168,0.15)", borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
                          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>EST. VALUE</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#00C8A8" }}>PKR {Math.round(result.analysis.estimatedProjectValue.totalMin / 1000)}k—{Math.round(result.analysis.estimatedProjectValue.totalMax / 1000)}k</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button onClick={saveTocrm} style={{ background: "rgba(0,200,168,0.12)", border: "1px solid rgba(0,200,168,0.3)", color: "#00C8A8", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>💾 Save to CRM</button>
                  <button onClick={handleExportPDF} style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#8B5CF6", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>📄 Export PDF</button>
                  <button onClick={() => { setResult(null); setUrl(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#637B96", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← New Audit</button>
                </div>
              </Card>

              {/* TABS */}
              <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
                {TABS.filter(t => t !== "Healthcare" || result.analysis.isHealthcare || result.analysis.healthcareRecommendations).map(t => (
                  <button key={t} className={`tab-btn${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)}>{t}</button>
                ))}
              </div>

              {/* ── OVERVIEW TAB ── */}
              {activeTab === "Overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Quick stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                    {[
                      { l: "Title Tag", ok: !!result.crawlData.title },
                      { l: "Meta Description", ok: !!result.crawlData.metaDescription },
                      { l: "WhatsApp Link", ok: result.crawlData.hasWhatsApp },
                      { l: "Booking Form", ok: result.crawlData.hasBookingForm },
                      { l: "Schema Markup", ok: result.crawlData.hasSchema },
                      { l: "Live Chat", ok: result.crawlData.hasChatWidget },
                      { l: "SSL Secure", ok: result.crawlData.hasSSL },
                      { l: "Mobile Ready", ok: result.crawlData.hasViewport },
                      { l: "Google Analytics", ok: result.crawlData.hasGoogleAnalytics },
                      { l: "Social Links", ok: result.crawlData.socialLinks.length > 0 },
                    ].map(s => (
                      <div key={s.l} style={{ background: "#0B1A2E", border: `1px solid ${s.ok ? "rgba(0,200,168,0.12)" : "rgba(239,68,68,0.12)"}`, borderRadius: 10, padding: "12px 14px" }}>
                        <p style={{ fontSize: 10, color: "#637B96", marginBottom: 5 }}>{s.l}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: s.ok ? "#00C8A8" : "#EF4444" }}>{s.ok ? "✓ Present" : "✕ Missing"}</p>
                      </div>
                    ))}
                  </div>

                  {/* Executive Summary */}
                  <Card>
                    <SectionTitle label="Executive Summary" icon="📋" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
                      {[
                        { label: "Top 3 Problems", items: result.analysis.executiveSummary?.top3Problems || [], color: "#EF4444" },
                        { label: "Top 3 Quick Wins", items: result.analysis.executiveSummary?.top3QuickWins || [], color: "#F59E0B" },
                        { label: "Revenue Opportunities", items: result.analysis.executiveSummary?.top3RevenueOpportunities || [], color: "#00C8A8" },
                      ].map(s => (
                        <div key={s.label} style={{ background: "#0F2040", borderRadius: 12, padding: "16px 18px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>{s.label}</p>
                          {s.items.map((item, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.55, marginBottom: 8 }}>
                              <span style={{ color: s.color, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span> {item}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Findings */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
                    {[
                      { title: "SEO Analysis", data: result.analysis.seoFindings },
                      { title: "UX & Design", data: result.analysis.uxFindings },
                      { title: "Conversion Rate", data: result.analysis.conversionFindings },
                    ].map(f => (
                      <Card key={f.title}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</span>
                          <span style={{ fontWeight: 700, fontSize: 16, color: f.data.score >= 70 ? "#00C8A8" : f.data.score >= 40 ? "#F59E0B" : "#EF4444" }}>{f.data.score}/100</span>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          {f.data.issues?.slice(0, 3).map((iss, i) => <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 5 }}><span style={{ color: "#EF4444", flexShrink: 0 }}>✕</span>{iss}</div>)}
                        </div>
                        <div>
                          {f.data.opportunities?.slice(0, 3).map((op, i) => <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 5 }}><span style={{ color: "#00C8A8", flexShrink: 0 }}>→</span>{op}</div>)}
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Key Insights */}
                  <Card>
                    <SectionTitle label="Key Insights" icon="💡" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
                      {result.analysis.keyInsights?.map((ins, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, background: "#0F2040", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                          <span style={{ color: "#00C8A8", flexShrink: 0 }}>◆</span>{ins}
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* ── SCORES TAB ── */}
              {activeTab === "Scores" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <SectionTitle label="Opportunity Score Engine" icon="📊" />
                    <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                      {[
                        { label: "Overall", val: result.analysis.scores.overall },
                        { label: "Website", val: result.analysis.scores.websiteQuality },
                        { label: "SEO", val: result.analysis.scores.seo },
                        { label: "Conversion", val: result.analysis.scores.conversion },
                        { label: "Automation", val: result.analysis.scores.automation },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: "center" }}>
                          <ScoreRing score={s.val} size={s.label === "Overall" ? 80 : 62} />
                          <p style={{ fontSize: 11, color: "#637B96", marginTop: 4 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <ScoreBar label="Website Quality" value={result.analysis.scores.websiteQuality} desc="Design, structure, mobile" />
                    <ScoreBar label="SEO Score" value={result.analysis.scores.seo} desc="Meta, schema, headings" />
                    <ScoreBar label="Conversion Score" value={result.analysis.scores.conversion} desc="CTAs, forms, booking" />
                    <ScoreBar label="Automation Score" value={result.analysis.scores.automation} desc="Analytics, chat, CRM" />
                  </Card>
                  <Card>
                    <SectionTitle label="Estimated Project Value" icon="💰" />
                    {result.analysis.estimatedProjectValue && (() => {
                      const ev = result.analysis.estimatedProjectValue;
                      const items = [
                        { label: "Website Upgrade", data: ev.websiteUpgrade, icon: "🌐", color: "#4A90E2" },
                        { label: "AI Chatbot", data: ev.aiChatbot, icon: "🤖", color: "#8B5CF6" },
                        { label: "CRM System", data: ev.crmSystem, icon: "📊", color: "#F59E0B" },
                        { label: "WhatsApp Automation", data: ev.whatsappAutomation, icon: "💬", color: "#25D366" },
                      ];
                      return (
                        <>
                          {items.map(item => item.data && (
                            <div key={item.label} style={{ background: "#0F2040", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.icon} {item.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>PKR {Math.round(item.data.min / 1000)}k — {Math.round(item.data.max / 1000)}k</span>
                              </div>
                              <p style={{ fontSize: 11, color: "#637B96", lineHeight: 1.5 }}>{item.data.reason}</p>
                            </div>
                          ))}
                          <div style={{ background: "rgba(0,200,168,0.08)", border: "1px solid rgba(0,200,168,0.2)", borderRadius: 10, padding: "14px 16px", marginTop: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 700, fontSize: 13 }}>Total Opportunity</span>
                              <span style={{ fontWeight: 800, fontSize: 16, color: "#00C8A8" }}>PKR {Math.round(ev.totalMin / 1000)}k — {Math.round(ev.totalMax / 1000)}k</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </Card>
                </div>
              )}

              {/* ── OUTREACH TAB ── */}
              {activeTab === "Outreach" && result.analysis.outreach && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "WhatsApp Message", icon: "💬", color: "#25D366", content: result.analysis.outreach.whatsapp },
                    { label: "Email Pitch", icon: "✉️", color: "#4A90E2", content: result.analysis.outreach.email ? `Subject: ${result.analysis.outreach.email.subject}\n\n${result.analysis.outreach.email.body}` : "" },
                    { label: "LinkedIn Message", icon: "💼", color: "#0077B5", content: result.analysis.outreach.linkedin },
                  ].map(msg => (
                    <Card key={msg.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{msg.icon}</span>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{msg.label}</span>
                        </div>
                        <CopyBtn text={msg.content} />
                      </div>
                      <div style={{ background: "#0F2040", borderLeft: `3px solid ${msg.color}`, borderRadius: "0 10px 10px 0", padding: "14px 16px", fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    </Card>
                  ))}
                </div>
              )}

              {/* ── GAPS TAB ── */}
              {activeTab === "Gaps" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Card>
                    <SectionTitle label="Competitor Gap Analysis" icon="🔍" />
                    {result.analysis.competitorGaps?.map((gap, i) => (
                      <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#0F2040", borderRadius: 10, padding: "14px 16px", marginBottom: 10, borderLeft: `3px solid ${gap.present ? "#22C55E" : SEV_COLORS[gap.severity] || "#EF4444"}` }}>
                        <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{gap.present ? "✅" : "❌"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{gap.gap}</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Tag color={gap.present ? "#22C55E" : "#EF4444"}>{gap.present ? "Present" : "Missing"}</Tag>
                              <Tag color={SEV_COLORS[gap.severity] || "#EF4444"}>{gap.severity}</Tag>
                            </div>
                          </div>
                          <p style={{ fontSize: 13, color: "#637B96", lineHeight: 1.5 }}>{gap.impact}</p>
                        </div>
                      </div>
                    ))}
                  </Card>
                  <Card>
                    <SectionTitle label="Competitive Weaknesses" icon="⚠️" />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.analysis.competitiveWeaknesses?.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, background: "#0F2040", borderRadius: 8, padding: "10px 14px" }}>
                          <span style={{ color: "#EF4444", flexShrink: 0 }}>✕</span>{w}
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* ── SERVICES TAB ── */}
              {activeTab === "Services" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Card>
                    <SectionTitle label="Recommended Services to Pitch" icon="💼" />
                    {result.analysis.recommendedServices?.map((s, i) => (
                      <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", background: "#0F2040", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{i + 1}. {s.service}</span>
                            <Tag color={s.priority === "High" ? "#EF4444" : s.priority === "Medium" ? "#F59E0B" : "#22C55E"}>{s.priority}</Tag>
                          </div>
                          <p style={{ fontSize: 13, color: "#637B96", lineHeight: 1.5 }}>{s.reason}</p>
                        </div>
                        <div style={{ background: "rgba(0,200,168,0.08)", border: "1px solid rgba(0,200,168,0.15)", borderRadius: 8, padding: "10px 16px", textAlign: "center", minWidth: 120 }}>
                          <p style={{ fontSize: 10, color: "#637B96", marginBottom: 3 }}>Est. Price</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#00C8A8" }}>{s.estimatedPrice}</p>
                        </div>
                      </div>
                    ))}
                  </Card>
                  <Card>
                    <SectionTitle label="AI Automation Opportunities" icon="🤖" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
                      {result.analysis.aiAutomationOpportunities?.map((op, i) => (
                        <div key={i} style={{ background: "#0F2040", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 12, padding: "16px 18px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, flex: 1, paddingRight: 8 }}>{op.title}</span>
                            <Tag color={op.impact === "High" ? "#EF4444" : op.impact === "Medium" ? "#F59E0B" : "#22C55E"}>{op.impact}</Tag>
                          </div>
                          <p style={{ fontSize: 13, color: "#637B96", lineHeight: 1.55, marginBottom: 10 }}>{op.description}</p>
                          <p style={{ fontSize: 12, color: "#8B5CF6", fontWeight: 500 }}>💡 {op.estimatedValue}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* ── HEALTHCARE TAB ── */}
              {activeTab === "Healthcare" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Card style={{ borderColor: "rgba(236,72,153,0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <span style={{ fontSize: 24 }}>🏥</span>
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Healthcare Mode</h2>
                        <p style={{ fontSize: 12, color: "#637B96" }}>Specialized recommendations for {result.analysis.industry} practices</p>
                      </div>
                    </div>
                    {result.analysis.healthcareRecommendations ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
                        {result.analysis.healthcareRecommendations.map((r, i) => (
                          <div key={i} style={{ background: "#0F2040", border: "1px solid rgba(236,72,153,0.12)", borderRadius: 12, padding: "16px 18px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.feature}</span>
                              <Tag color={r.impact === "High" ? "#EF4444" : r.impact === "Medium" ? "#F59E0B" : "#22C55E"}>{r.impact}</Tag>
                            </div>
                            <p style={{ fontSize: 13, color: "#637B96", lineHeight: 1.55 }}>{r.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                        {[
                          { icon: "📅", title: "Online Appointment Booking", desc: "Let patients book 24/7 without calling. Reduces no-shows by 30%." },
                          { icon: "🤖", title: "AI Patient Assistant", desc: "Answer FAQs, guide patients through services, collect symptoms before visits." },
                          { icon: "💬", title: "WhatsApp Follow-up System", desc: "Automated reminders, prescription alerts, and recovery check-ins via WhatsApp." },
                          { icon: "📋", title: "Patient Management System", desc: "Digital records, treatment history, session tracking and billing." },
                          { icon: "📊", title: "Recovery Progress Tracker", desc: "Let patients log progress between sessions. Boosts engagement and retention." },
                          { icon: "💳", title: "Digital Billing & Receipts", desc: "Paperless invoicing with payment history and insurance claim support." },
                        ].map((h) => (
                          <div key={h.title} style={{ background: "#0F2040", border: "1px solid rgba(236,72,153,0.1)", borderRadius: 12, padding: "16px 18px" }}>
                            <div style={{ fontSize: 24, marginBottom: 10 }}>{h.icon}</div>
                            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{h.title}</p>
                            <p style={{ fontSize: 13, color: "#637B96", lineHeight: 1.55 }}>{h.desc}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* ── RAW DATA TAB ── */}
              {activeTab === "Raw Data" && (
                <Card>
                  <SectionTitle label="Raw Crawl Data" icon="🕷️" />
                  <pre style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, overflow: "auto", maxHeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#050D1A", borderRadius: 10, padding: 16 }}>
                    {JSON.stringify({
                      url: result.crawlData.url, title: result.crawlData.title,
                      metaDescription: result.crawlData.metaDescription,
                      detectedIndustry: result.crawlData.detectedIndustry,
                      h1s: result.crawlData.h1s, h2s: result.crawlData.h2s,
                      navItems: result.crawlData.navItems, ctaButtons: result.crawlData.ctaButtons,
                      phones: result.crawlData.phones, emails: result.crawlData.emails,
                      hasWhatsApp: result.crawlData.hasWhatsApp, hasBookingForm: result.crawlData.hasBookingForm,
                      hasSchema: result.crawlData.hasSchema, hasChatWidget: result.crawlData.hasChatWidget,
                      hasSSL: result.crawlData.hasSSL, hasGoogleAnalytics: result.crawlData.hasGoogleAnalytics,
                      socialLinks: result.crawlData.socialLinks,
                      imagesWithoutAlt: result.crawlData.imagesWithoutAlt, totalImages: result.crawlData.totalImages,
                    }, null, 2)}
                  </pre>
                </Card>
              )}
            </div>
          )}

          {/* FEATURE GRID (empty state) */}
          {!result && !loading && (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 80px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
                {[
                  { icon: "🕷️", title: "Real Website Crawl", desc: "Live HTML fetch with Cheerio — extracts SEO, CTAs, forms, phones, emails, WhatsApp and social links." },
                  { icon: "📊", title: "5-Dimension Score Engine", desc: "Website Quality, SEO, Conversion, Automation & Overall Opportunity scores based on real data." },
                  { icon: "💰", title: "Project Value Estimator", desc: "Auto-calculates Website, Chatbot, CRM & WhatsApp Automation value in PKR per audit." },
                  { icon: "✉️", title: "Outreach Generator", desc: "Personalized WhatsApp, Email & LinkedIn messages using your actual audit findings." },
                  { icon: "🏥", title: "Healthcare Mode", desc: "Specialized recommendations for clinics, physio centers, dental and hospital practices." },
                  { icon: "📄", title: "PDF Report Export", desc: "7-page branded PDF report ready to send to prospects or use in your agency proposals." },
                  { icon: "📋", title: "Lead CRM", desc: "Save prospects, track outreach status, add notes, and export leads as CSV." },
                  { icon: "🔍", title: "Competitor Gap Analysis", desc: "Identify every missing system with severity ratings and business impact descriptions." },
                ].map(f => (
                  <div key={f.title} style={{ background: "#0B1A2E", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "22px 20px" }}>
                    <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
                    <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{f.title}</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
