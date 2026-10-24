import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { bookingsQuery, meQuery } from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/bookings/")({
  head: () => ({
    meta: [
      { title: "Bookings — Stagehand" },
      { name: "description", content: "Your gigs and conversations with the Stagehand manager." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(meQuery), context.queryClient.ensureQueryData(bookingsQuery)]);
  },
  component: Bookings,
});

function Bookings() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data } = useSuspenseQuery(bookingsQuery);
  const isVenue = !!me.venue;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-6xl">Bookings</h1>
      <div className="mt-8 space-y-4">
        {data.length === 0 && (
          <p className="text-muted-foreground">
            {isVenue ? "Claim an artist from Discover to start a booking." : "No venue has claimed you yet — hang tight."}
          </p>
        )}
        {data.map((b) => (
          <Link
            key={b.id}
            to="/bookings/$id"
            params={{ id: b.id }}
            className="poster-sm flex items-center justify-between gap-4 bg-card p-4 transition-transform hover:-translate-y-0.5"
          >
            <div>
              <div className="font-display text-2xl">{isVenue ? b.artists?.name : b.venues?.name}</div>
              <div className="text-sm text-muted-foreground">
                ${b.offer_amount} · {b.gig_date ?? "date TBD"}
                {!isVenue && b.venues ? ` · ${b.venues.borough}` : ""}
              </div>
            </div>
            <span className={`px-2 py-1 text-xs font-bold uppercase ${b.status === "confirmed" ? "bg-mint text-paper-foreground" : b.status === "declined" ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {STATUS_LABEL[b.status] ?? b.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
