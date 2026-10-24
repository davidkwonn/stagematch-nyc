import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { GENRES } from "@/lib/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stagehand — Get booked at NYC bars & venues" },
      {
        name: "description",
        content: "NYC artists post a 30-second clip. Venues swipe, claim, and an AI manager sets up the paid gig.",
      },
      { property: "og:title", content: "Stagehand — Get booked at NYC bars & venues" },
      {
        property: "og:description",
        content: "NYC artists post a 30-second clip. Venues swipe, claim, and an AI manager sets up the paid gig.",
      },
    ],
  }),
  component: Index,
});

const steps = [
  { n: "01", t: "Artists post a 30s clip", d: "Name, story, sound, and a short video of you playing.", c: "bg-primary text-primary-foreground" },
  { n: "02", t: "Venues swipe", d: "Bars and rooms across the five boroughs flip through artists in their style.", c: "bg-secondary text-secondary-foreground" },
  { n: "03", t: "Claim & make an offer", d: "Found your act? Claim them and name your price.", c: "bg-accent text-accent-foreground" },
  { n: "04", t: "AI manager books it", d: "Our manager talks to both sides, locks the date, and gets it confirmed.", c: "bg-mint text-paper-foreground" },
];

function Index() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <p className="mb-4 inline-block -rotate-2 bg-secondary px-2 py-1 text-xs font-bold uppercase tracking-widest text-secondary-foreground">
            Five boroughs. Every genre.
          </p>
          <h1 className="font-display text-6xl md:text-8xl">
            Play the room.
            <br />
            <span className="text-primary">Get paid</span>{" "}
            <span className="font-serif-italic text-5xl text-secondary md:text-7xl">for it.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Stagehand connects small NYC artists with bars, clubs and music rooms that need live acts.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button asChild size="lg" variant="poster">
              <Link to="/auth" search={{ as: "artist" }}>I'm an artist</Link>
            </Button>
            <Button asChild size="lg" variant="acid">
              <Link to="/auth" search={{ as: "venue" }}>I run a venue</Link>
            </Button>
          </div>
        </div>
        <div className="tape rotate-1">
          <img src={hero} alt="NYC musicians collage" width={1600} height={1008} className="poster w-full" />
        </div>
      </section>

      <div className="overflow-hidden border-y-2 border-foreground bg-paper py-3 text-paper-foreground">
        <div className="animate-marquee flex w-max gap-8 whitespace-nowrap font-display text-2xl">
          {[...GENRES, ...GENRES].map((g, i) => (
            <span key={i}>
              {g} <span className="text-primary">✦</span>
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-5xl">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.n} className={`poster p-5 ${s.c} ${i % 2 ? "rotate-1" : "-rotate-1"}`}>
              <div className="font-display text-4xl">{s.n}</div>
              <h3 className="mt-3 text-lg font-bold uppercase">{s.t}</h3>
              <p className="mt-2 text-sm opacity-90">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
