export type CRMLead = {
  id: string;
  businessName: string;
  website: string;
  phones: string[];
  emails: string[];
  industry: string;
  auditDate: string;
  opportunityScore: number;
  opportunityLevel: "Low" | "Medium" | "High";
  estimatedValueMin: number;
  estimatedValueMax: number;
  outreachStatus: "Not Contacted" | "WhatsApp Sent" | "Email Sent" | "In Negotiation" | "Closed Won" | "Closed Lost";
  notes: string;
};

const STORAGE_KEY = "leadhunter_crm";

export function getLeads(): CRMLead[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function saveLead(lead: CRMLead): void {
  if (typeof window === "undefined") return;
  const leads = getLeads();
  const existing = leads.findIndex(l => l.website === lead.website);
  if (existing >= 0) leads[existing] = lead;
  else leads.unshift(lead);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

export function updateLeadStatus(id: string, status: CRMLead["outreachStatus"], notes?: string): void {
  if (typeof window === "undefined") return;
  const leads = getLeads();
  const lead = leads.find(l => l.id === id);
  if (lead) {
    lead.outreachStatus = status;
    if (notes !== undefined) lead.notes = notes;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  }
}

export function deleteLead(id: string): void {
  if (typeof window === "undefined") return;
  const leads = getLeads().filter(l => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

export function formatPKR(amount: number): string {
  if (amount >= 100000) return `PKR ${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `PKR ${(amount / 1000).toFixed(0)}k`;
  return `PKR ${amount}`;
}
