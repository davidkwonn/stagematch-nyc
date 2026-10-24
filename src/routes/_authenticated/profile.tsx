import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { meQuery, signedVideoUrl } from "@/lib/queries";
import { ageFrom } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My artist profile — Stagehand" },
      { name: "description", content: "Your Stagehand artist profile as venues see it." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: Profile,
});

function Profile() {
  const { data: me } = useSuspenseQuery(meQuery);
  const a = me.artist;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (a) signedVideoUrl(a.video_path).then(setUrl);
  }, [a]);

  if (!a) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-5xl">No artist profile yet</h1>
        <Button asChild variant="poster" className="mt-6">
          <Link to="/onboarding">Set one up</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
      <div className="tape -rotate-1">
        {url ? <video src={url} controls className="poster w-full bg-card" /> : <div className="poster aspect-video bg-card" />}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-secondary">This is how venues see you</p>
        <h1 className="mt-2 font-display text-6xl">{a.name}</h1>
        <p className="mt-1 text-muted-foreground">Age {ageFrom(a.birthday)}</p>
        <div className="mt-4 flex flex-wrap gap-1">
          {a.genres.map((g) => (
            <span key={g} className="bg-primary px-2 py-0.5 text-xs font-bold uppercase text-primary-foreground">{g}</span>
          ))}
        </div>
        <p className="mt-6 whitespace-pre-line">{a.background}</p>
        <Button asChild variant="acid" className="mt-8">
          <Link to="/bookings">See my bookings</Link>
        </Button>
      </div>
    </div>
  );
}
