// Server-only reads and actions for /admin. Outreach tables are service-role only (no RLS policies),
// so everything here uses the admin client. Not in the generated types yet: untyped client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminInput,
  AdminResult,
  Funnel,
  LeadKind,
  OutreachLead,
  OutreachMessage,
  OutreachRun,
  RunStats,
} from "./admin.functions";

const LEAD_COLS =
  "id,kind,name,source,source_url,borough,genre,venue_type,email,contact_type,score,status,bio_snippet,created_at,contacted_at";
const RUN_TIMEOUT_MS = 70_000;
const CONTACTED = new Set(["contacted", "replied", "signed_up"]);

export function isAdmin(email: string | undefined | null): boolean {
  const admins = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && admins.includes(String(email).toLowerCase());
}

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

function checked<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const requireLead = (id: string | undefined) => {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid lead");
  return id;
};

function funnel(
  leads: { kind: LeadKind; status: string }[],
  runs: { kind: LeadKind; raw_results: number }[],
  kind: LeadKind,
): Funnel {
  const mine = leads.filter((l) => l.kind === kind);
  return {
    searched: runs.filter((r) => r.kind === kind).reduce((n, r) => n + (r.raw_results ?? 0), 0),
    accepted: mine.length,
    contacted: mine.filter((l) => CONTACTED.has(l.status)).length,
    replied: mine.filter((l) => l.status === "replied" || l.status === "signed_up").length,
    signed_up: mine.filter((l) => l.status === "signed_up").length,
  };
}

async function overview(): Promise<AdminResult> {
  const c = await db();
  const [leads, statuses, messages, runs, runTotals] = await Promise.all([
    c.from("outreach_leads").select(LEAD_COLS).order("score", { ascending: false }).limit(400),
    c.from("outreach_leads").select("kind,status").limit(10000),
    c
      .from("outreach_messages")
      .select("id,lead_id,subject,body,status,created_at,sent_at,outreach_leads(name,kind)")
      .order("created_at", { ascending: false })
      .limit(100),
    c.from("outreach_runs").select("*").order("started_at", { ascending: false }).limit(30),
    c.from("outreach_runs").select("kind,raw_results").limit(5000),
  ]);
  const statusRows = checked(statuses) as { kind: LeadKind; status: string }[];
  const totals = checked(runTotals) as { kind: LeadKind; raw_results: number }[];
  // outreach_leads is a to-one embed (message → lead); PostgREST returns it as an object.
  const msgs = (
    checked(messages) as unknown as (Omit<OutreachMessage, "lead_name" | "lead_kind"> & {
      outreach_leads: { name: string; kind: LeadKind } | null;
    })[]
  ).map(({ outreach_leads, ...m }) => ({
    ...m,
    lead_name: outreach_leads?.name ?? "",
    lead_kind: outreach_leads?.kind ?? "artist",
  }));
  return {
    simulate: process.env["OUTREACH_SIMULATE"] !== "false",
    funnel: {
      artist: funnel(statusRows, totals, "artist"),
      venue: funnel(statusRows, totals, "venue"),
    },
    leads: checked(leads) as OutreachLead[],
    messages: msgs,
    runs: checked(runs) as OutreachRun[],
  };
}

// "Run now": call the outreach-run Edge Function with the service key, like Mack does.
async function runNow(kind: LeadKind): Promise<AdminResult> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured");
  const res = await fetch(`${url}/functions/v1/outreach-run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Run failed: ${(body as { error?: string }).error ?? res.status}`);
  return { run: body as RunStats };
}

export async function handleAdmin(data: AdminInput): Promise<AdminResult> {
  const c = await db();
  if (data.action === "overview") return overview();
  if (data.action === "run") return runNow(data.kind === "venue" ? "venue" : "artist");
  const id = requireLead(data.lead_id);
  if (data.action === "lead") {
    const lead = checked(
      await c.from("outreach_leads").select(LEAD_COLS).eq("id", id).single(),
    ) as OutreachLead;
    const messages = checked(
      await c
        .from("outreach_messages")
        .select("id,lead_id,subject,body,status,created_at,sent_at")
        .eq("lead_id", id)
        .order("created_at"),
    ) as Omit<OutreachMessage, "lead_name" | "lead_kind">[];
    return {
      lead,
      messages: messages.map((m) => ({ ...m, lead_name: lead.name, lead_kind: lead.kind })),
    };
  }
  if (data.action === "approve") {
    checked(
      await c
        .from("outreach_leads")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("status", "new")
        .eq("contact_type", "email"),
    );
    return { ok: true };
  }
  if (data.action === "dnc") {
    const lead = checked(await c.from("outreach_leads").select("email").eq("id", id).single()) as {
      email: string | null;
    };
    if (lead.email)
      checked(
        await c
          .from("do_not_contact")
          .upsert({ email: lead.email.toLowerCase(), reason: "admin" }, { onConflict: "email" }),
      );
    checked(await c.from("outreach_leads").update({ status: "opted_out" }).eq("id", id));
    return { ok: true };
  }
  throw new Error("Unknown action");
}
