import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Ban, Check, ExternalLink, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/data/metadata";
import { adminAction, type Funnel, type LeadKind, type OutreachLead } from "@/data/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => pageHead("Outreach", "Mack’s sourcing and outreach center."),
  component: Admin,
});

type Tab = "artist" | "venue" | "messages" | "runs";
const REFRESH_MS = 10_000;
const STEPS: [keyof Funnel, string][] = [
  ["searched", "Pages searched"],
  ["accepted", "Accepted"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["signed_up", "Signed up"],
];
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function Admin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("artist");
  const [open, setOpen] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["admin"],
    queryFn: () => adminAction({ data: { action: "overview" } }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const run = useMutation({
    mutationFn: (kind: LeadKind) => adminAction({ data: { action: "run", kind } }),
    onSuccess: (r) => {
      const s = r.run;
      toast.success(
        `Searched ${s?.raw_results ?? 0} pages, ${s?.accepted ?? 0} new leads, ${s?.drafted ?? 0} emails simulated`,
      );
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });
  const act = useMutation({
    mutationFn: (v: { action: "approve" | "dnc"; lead_id: string }) => adminAction({ data: v }),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (overview.isError)
    return (
      <main className="flex min-h-screen items-center justify-center bg-background font-display text-4xl">
        Not found
      </main>
    );
  if (!overview.data)
    return (
      <main className="min-h-screen bg-background px-5 py-8 text-sm text-muted-foreground">
        Loading outreach…
      </main>
    );
  const d = overview.data;
  const artistF = d.funnel?.artist;
  const leads = (d.leads ?? []).filter((l) => l.kind === tab);

  return (
    <main className="min-h-screen bg-background px-5 py-8 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-foreground pb-6">
        <div className="flex items-end gap-4">
          <Link to="/" className="font-display text-4xl">
            Stage<span className="text-primary">hand</span>
          </Link>
          <span className="mb-1 text-xs font-bold uppercase text-muted-foreground">
            Outreach center
          </span>
          {d.simulate && (
            <span className="mb-1 rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase text-secondary-foreground">
              Simulation ON
            </span>
          )}
        </div>
        <Link to="/live" className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
          <Radio className="size-4" />
          Open /live
          <ArrowUpRight className="size-4" />
        </Link>
      </header>

      <p className="mt-6 font-display text-2xl md:text-3xl">
        Mack searched {(artistF?.searched ?? 0) + (d.funnel?.venue.searched ?? 0)} pages and
        recruited {artistF?.accepted ?? 0} artists and {d.funnel?.venue.accepted ?? 0} venues by
        himself.
      </p>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {(["artist", "venue"] as LeadKind[]).map((kind) => (
          <div key={kind} className="border-2 border-foreground p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="eyebrow">{kind === "artist" ? "Artists" : "Venues (bars first)"}</h2>
              <Button
                size="sm"
                variant={kind === "artist" ? "acid" : "poster"}
                disabled={run.isPending}
                onClick={() => run.mutate(kind)}
              >
                <Play className="size-4" />
                {run.isPending && run.variables === kind ? "Running…" : `Run ${kind}s now`}
              </Button>
            </div>
            <ol className="mt-4 grid grid-cols-5 gap-2 text-center">
              {STEPS.map(([key, label]) => (
                <li key={key}>
                  <div className="font-display text-2xl">{d.funnel?.[kind][key] ?? 0}</div>
                  <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <nav
        className="mt-8 flex gap-2 overflow-x-auto border-b border-border"
        aria-label="Outreach tabs"
      >
        {(["artist", "venue", "messages", "runs"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-11 px-4 text-sm font-bold uppercase ${tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          >
            {t === "artist"
              ? "Artists"
              : t === "venue"
                ? "Venues"
                : t === "messages"
                  ? "Messages"
                  : "Runs"}
          </button>
        ))}
      </nav>

      {(tab === "artist" || tab === "venue") && (
        <ul className="divide-y divide-border">
          {leads.length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">
              No leads yet. Tap “Run {tab}s now”.
            </li>
          )}
          {leads.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              open={open === l.id}
              onToggle={() => setOpen(open === l.id ? null : l.id)}
              onAct={(action) => act.mutate({ action, lead_id: l.id })}
            />
          ))}
        </ul>
      )}

      {tab === "messages" && (
        <ul className="divide-y divide-border">
          {(d.messages ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">No emails drafted yet.</li>
          )}
          {(d.messages ?? []).map((m) => (
            <li key={m.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-bold uppercase text-foreground">{m.status}</span>
                {m.lead_kind} · {m.lead_name} · {when(m.sent_at ?? m.created_at)}
              </div>
              <p className="mt-1 font-bold">{m.subject}</p>
              <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      {tab === "runs" && (
        <ul className="divide-y divide-border">
          {(d.runs ?? []).map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <span className="font-bold uppercase">{r.kind}</span> · {when(r.started_at)} ·{" "}
              {r.queries.length} queries · {r.raw_results} pages · {r.accepted} accepted ·{" "}
              {r.contact_form} contact form · {r.drafted} drafted
              {r.error ? <span className="text-destructive"> · {r.error}</span> : null}
              <div className="text-xs text-muted-foreground">
                Rejected:{" "}
                {Object.entries(r.rejected ?? {})
                  .map(([k, n]) => `${k} ${n}`)
                  .join(", ") || "none"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

type RowProps = {
  lead: OutreachLead;
  open: boolean;
  onToggle: () => void;
  onAct: (action: "approve" | "dnc") => void;
};

function LeadRow({ lead, open, onToggle, onAct }: RowProps) {
  const detail = useQuery({
    queryKey: ["admin-lead", lead.id],
    queryFn: () => adminAction({ data: { action: "lead", lead_id: lead.id } }),
    enabled: open,
    retry: false,
  });
  const draft = detail.data?.messages?.[0];
  const canApprove = lead.status === "new" && lead.contact_type === "email";
  const closed = lead.status === "opted_out" || lead.status === "declined";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 font-display text-2xl">{lead.score}</span>
        <button type="button" onClick={onToggle} className="min-h-11 flex-1 text-left">
          <span className="font-bold">{lead.name}</span>
          <span className="block text-xs text-muted-foreground">
            {[
              lead.venue_type ?? lead.genre,
              lead.borough,
              lead.contact_type === "email" ? "email" : "contact form",
              lead.status,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <a
          href={lead.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-1 text-xs text-muted-foreground"
        >
          {lead.source}
          <ExternalLink className="size-3" />
        </a>
        {canApprove && (
          <Button size="sm" variant="outline" onClick={() => onAct("approve")}>
            <Check className="size-4" />
            Approve
          </Button>
        )}
        {!closed && (
          <Button size="sm" variant="ghost" onClick={() => onAct("dnc")}>
            <Ban className="size-4" />
            Do not contact
          </Button>
        )}
      </div>
      {open && (
        <div className="ml-13 mt-2 border-l-2 border-primary pl-4 text-sm">
          {lead.bio_snippet && <p className="text-muted-foreground">{lead.bio_snippet}</p>}
          {detail.isLoading && <p className="mt-2 text-muted-foreground">Loading draft…</p>}
          {draft ? (
            <div className="mt-2">
              <p className="text-xs font-bold uppercase">
                {draft.status} · {when(draft.sent_at ?? draft.created_at)}
              </p>
              <p className="font-bold">{draft.subject}</p>
              <p className="whitespace-pre-line">{draft.body}</p>
            </div>
          ) : (
            !detail.isLoading && (
              <p className="mt-2 text-muted-foreground">
                {lead.contact_type === "email"
                  ? "No draft yet: approved leads get one on the next run."
                  : "Contact form only: never emailed."}
              </p>
            )
          )}
        </div>
      )}
    </li>
  );
}
