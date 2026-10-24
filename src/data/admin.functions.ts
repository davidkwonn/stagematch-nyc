// Admin outreach center: one signed-in server function, admins only (secret ADMIN_EMAILS).
// Non-admins get "Not found" so the page doesn't reveal itself.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeadKind = "artist" | "venue";
export type AdminInput = {
  action: "overview" | "lead" | "run" | "approve" | "dnc";
  kind?: LeadKind;
  lead_id?: string;
};
export type OutreachLead = {
  id: string;
  kind: LeadKind;
  name: string;
  source: string;
  source_url: string;
  borough: string | null;
  genre: string | null;
  venue_type: string | null;
  email: string | null;
  contact_type: "email" | "contact_form";
  score: number;
  status: string;
  bio_snippet: string | null;
  created_at: string;
  contacted_at: string | null;
};
export type OutreachMessage = {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  lead_name: string;
  lead_kind: LeadKind;
};
export type OutreachRun = {
  id: string;
  kind: LeadKind;
  started_at: string;
  finished_at: string | null;
  queries: string[];
  raw_results: number;
  accepted: number;
  contact_form: number;
  drafted: number;
  rejected: Record<string, number>;
  error: string | null;
};
export type Funnel = {
  searched: number;
  accepted: number;
  contacted: number;
  replied: number;
  signed_up: number;
};
export type RunStats = {
  kind?: string;
  queries?: number;
  raw_results?: number;
  accepted?: number;
  contact_form?: number;
  approved?: number;
  drafted?: number;
  simulated?: boolean;
  ms?: number;
  rejected?: Record<string, number>;
  error?: string;
};
export type AdminResult = {
  simulate?: boolean;
  funnel?: Record<LeadKind, Funnel>;
  leads?: OutreachLead[];
  messages?: OutreachMessage[];
  runs?: OutreachRun[];
  lead?: OutreachLead;
  run?: RunStats;
  ok?: boolean;
};

export const adminAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminInput) => input)
  .handler(async ({ data, context }): Promise<AdminResult> => {
    const { handleAdmin, isAdmin } = await import("./admin.server");
    const email = (context.claims as { email?: string }).email;
    if (!isAdmin(email)) throw new Error("Not found");
    return handleAdmin(data);
  });
