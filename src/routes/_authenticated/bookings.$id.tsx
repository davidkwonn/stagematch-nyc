import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/constants";
import { confirmBooking, sendMessage } from "@/lib/bookings.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const bookingQuery = (id: string) =>
  queryOptions({
    queryKey: ["booking", id],
    queryFn: async () => {
      const [{ data: booking, error }, { data: messages }] = await Promise.all([
        supabase.from("bookings").select("*, artists(*), venues(*)").eq("id", id).single(),
        supabase.from("booking_messages").select("*").eq("booking_id", id).order("created_at"),
      ]);
      if (error) throw error;
      return { booking, messages: messages ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  head: () => ({
    meta: [
      { title: "Booking chat — Stagehand" },
      { name: "description", content: "Work out the gig with the Stagehand AI manager." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([context.queryClient.ensureQueryData(meQuery), context.queryClient.ensureQueryData(bookingQuery(params.id))]);
  },
  component: BookingPage,
});

function BookingPage() {
  const { id } = Route.useParams();
  const q = bookingQuery(id);
  const { data } = useSuspenseQuery(q);
  const { data: me } = useSuspenseQuery(meQuery);
  const qc = useQueryClient();
  const send = useServerFn(sendMessage);
  const confirm = useServerFn(confirmBooking);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const { booking, messages } = data;
  const myRole = me.venue && booking.venue_id === me.venue.id ? "venue" : "artist";
  const myConfirmed = myRole === "venue" ? booking.venue_confirmed : booking.artist_confirmed;

  useEffect(() => {
    const ch = supabase
      .channel(`booking-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_messages", filter: `booking_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: q.queryKey }),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: q.queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc, q.queryKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    setThinking(true);
    try {
      const r = await send({ data: { bookingId: id, content } });
      if (r.agentError) toast.error("The manager couldn't reply just now. Try again in a moment.");
    } catch (err) {
      setText(content);
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setThinking(false);
      qc.invalidateQueries({ queryKey: q.queryKey });
    }
  }

  async function act(decline?: boolean) {
    try {
      await confirm({ data: { bookingId: id, decline } });
      qc.invalidateQueries({ queryKey: q.queryKey });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  const nameFor = (r: string) => (r === "agent" ? "Mack · AI manager" : r === "venue" ? booking.venues?.name : booking.artists?.name);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[70vh] flex-col poster bg-card">
        <div className="border-b-2 border-foreground p-4">
          <h1 className="font-display text-3xl">
            {booking.artists?.name} <span className="font-serif-italic text-secondary">at</span> {booking.venues?.name}
          </h1>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m) => {
            const mine = m.sender_role === myRole;
            const agent = m.sender_role === "agent";
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{nameFor(m.sender_role)}</span>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap px-4 py-2 text-sm",
                    agent ? "border-l-4 border-primary bg-muted" : mine ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground",
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
          {thinking && <div className="text-sm text-muted-foreground">Mack is typing…</div>}
          <div ref={bottom} />
        </div>
        {booking.status === "pending" && (
          <form onSubmit={submit} className="flex gap-2 border-t-2 border-foreground p-3">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Reply to the manager…"
              className="resize-none"
            />
            <Button type="submit" variant="poster" disabled={thinking} className="self-end">
              Send
            </Button>
          </form>
        )}
      </div>
      <aside className="space-y-4">
        <div className="poster-sm bg-paper p-5 text-paper-foreground">
          <div className="text-xs font-bold uppercase tracking-widest">Status</div>
          <div className="font-display text-3xl">{STATUS_LABEL[booking.status] ?? booking.status}</div>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Offer</dt><dd className="font-bold">${booking.offer_amount}</dd></div>
            <div className="flex justify-between"><dt>Date</dt><dd className="font-bold">{booking.gig_date ?? "TBD"}</dd></div>
            <div className="flex justify-between"><dt>Venue</dt><dd>{booking.venue_confirmed ? "✓ confirmed" : "—"}</dd></div>
            <div className="flex justify-between"><dt>Artist</dt><dd>{booking.artist_confirmed ? "✓ confirmed" : "—"}</dd></div>
          </dl>
        </div>
        {booking.status === "pending" && (
          <div className="space-y-2">
            <Button variant="acid" className="w-full" disabled={!booking.gig_date || myConfirmed} onClick={() => act()}>
              {myConfirmed ? "You confirmed" : "Confirm booking"}
            </Button>
            {!booking.gig_date && <p className="text-xs text-muted-foreground">Agree on a date with Mack first.</p>}
            <Button variant="ghost" className="w-full" onClick={() => act(true)}>
              Pass on this booking
            </Button>
          </div>
        )}
        {booking.venues && myRole === "artist" && (
          <div className="poster-sm bg-card p-4 text-sm">
            <div className="font-bold">{booking.venues.name}</div>
            <div className="text-muted-foreground">{booking.venues.address}, {booking.venues.borough}</div>
          </div>
        )}
        {booking.status === "confirmed" && (
          <p className="text-xs text-muted-foreground">Payments are coming soon: the venue will pay up front and the artist gets paid once the show is confirmed.</p>
        )}
      </aside>
    </div>
  );
}
