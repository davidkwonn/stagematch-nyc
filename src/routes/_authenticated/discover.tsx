import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Heart, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, signedVideoUrl } from "@/lib/queries";
import { ageFrom } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "@/components/ClaimDialog";

const deckQuery = (venueId: string, genres: string[]) =>
  queryOptions({
    queryKey: ["deck", venueId],
    queryFn: async () => {
      const [{ data: artists, error }, { data: swipes }] = await Promise.all([
        supabase.from("artists").select("*").overlaps("genres", genres).order("created_at", { ascending: false }).limit(100),
        supabase.from("swipes").select("artist_id, liked").eq("venue_id", venueId),
      ]);
      if (error) throw error;
      const seen = new Set((swipes ?? []).map((s) => s.artist_id));
      const likedIds = new Set((swipes ?? []).filter((s) => s.liked).map((s) => s.artist_id));
      const all = artists ?? [];
      const { data: liked } = likedIds.size
        ? await supabase.from("artists").select("id, name, genres").in("id", [...likedIds])
        : { data: [] as { id: string; name: string; genres: string[] }[] };
      return { deck: all.filter((a) => !seen.has(a.id)), liked: liked ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover artists — Stagehand" },
      { name: "description", content: "Swipe through NYC artists that match your venue's sound." },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.venue) await context.queryClient.ensureQueryData(deckQuery(me.venue.id, me.venue.genres));
  },
  component: Discover,
});

function Discover() {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me.venue) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-5xl">Venues only</h1>
        <p className="mt-3 text-muted-foreground">Discover is for venues looking for artists.</p>
        <Button asChild variant="poster" className="mt-6">
          <Link to="/profile">Go to my profile</Link>
        </Button>
      </div>
    );
  }
  return <Deck venueId={me.venue.id} genres={me.venue.genres} venueName={me.venue.name} />;
}

function Deck({ venueId, genres, venueName }: { venueId: string; genres: string[]; venueName: string }) {
  const q = deckQuery(venueId, genres);
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const current = data.deck[0];

  async function swipe(liked: boolean) {
    if (!current) return;
    qc.setQueryData(q.queryKey, (old) =>
      old ? { deck: old.deck.slice(1), liked: liked ? [{ id: current.id, name: current.name, genres: current.genres }, ...old.liked] : old.liked } : old,
    );
    await supabase.from("swipes").upsert({ venue_id: venueId, artist_id: current.id, liked }, { onConflict: "venue_id,artist_id" });
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="font-display text-5xl">
          Tonight at <span className="text-primary">{venueName}</span>?
        </h1>
        <p className="mt-2 text-muted-foreground">Swipe right to shortlist, left to pass. Matching: {genres.join(", ")}</p>
        <div className="mt-8 flex justify-center">
          {current ? (
            <SwipeCard key={current.id} artist={current} onSwipe={swipe} />
          ) : (
            <div className="poster w-full max-w-md bg-card p-10 text-center">
              <div className="font-display text-4xl">That's everyone</div>
              <p className="mt-2 text-sm text-muted-foreground">New artists join all the time. Check your shortlist →</p>
            </div>
          )}
        </div>
      </div>
      <aside>
        <h2 className="font-display text-3xl">Shortlist</h2>
        <div className="mt-4 space-y-3">
          {data.liked.length === 0 && <p className="text-sm text-muted-foreground">Swipe right on artists you like.</p>}
          {data.liked.map((a) => (
            <div key={a.id} className="poster-sm flex items-center justify-between gap-2 bg-card p-3">
              <div>
                <div className="font-bold">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.genres.join(" · ")}</div>
              </div>
              <ClaimDialog artistId={a.id} artistName={a.name} trigger={<Button size="sm" variant="acid">Claim</Button>} />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

type Artist = { id: string; name: string; birthday: string; background: string; genres: string[]; video_path: string | null };

function SwipeCard({ artist, onSwipe }: { artist: Artist; onSwipe: (liked: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    signedVideoUrl(artist.video_path).then(setUrl);
  }, [artist.video_path]);

  function end() {
    if (dx > 120) onSwipe(true);
    else if (dx < -120) onSwipe(false);
    setDx(0);
    start.current = null;
  }

  return (
    <div className="w-full max-w-md">
      <div
        className="poster touch-pan-y select-none bg-card"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 20}deg)`, transition: start.current === null ? "transform .2s" : "none" }}
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
        onPointerUp={end}
        onPointerLeave={() => start.current !== null && end()}
      >
        <div className="relative aspect-[4/5] bg-muted">
          {url ? (
            <video src={url} autoPlay loop playsInline controls className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading clip…</div>
          )}
          {dx > 40 && <div className="absolute left-4 top-4 -rotate-12 border-4 border-mint px-3 font-display text-4xl text-mint">Yes</div>}
          {dx < -40 && <div className="absolute right-4 top-4 rotate-12 border-4 border-destructive px-3 font-display text-4xl text-destructive">Pass</div>}
        </div>
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-4xl">{artist.name}</h2>
            <span className="text-muted-foreground">{ageFrom(artist.birthday)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {artist.genres.map((g) => (
              <span key={g} className="bg-secondary px-2 py-0.5 text-xs font-bold uppercase text-secondary-foreground">{g}</span>
            ))}
          </div>
          <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{artist.background}</p>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-4">
        <Button size="lg" variant="paper" onClick={() => onSwipe(false)} aria-label="Pass">
          <X /> Pass
        </Button>
        <ClaimDialog artistId={artist.id} artistName={artist.name} trigger={<Button size="lg" variant="acid">Claim</Button>} />
        <Button size="lg" variant="poster" onClick={() => onSwipe(true)} aria-label="Like">
          <Heart /> Like
        </Button>
      </div>
    </div>
  );
}
