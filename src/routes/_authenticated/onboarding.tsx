import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenrePicker } from "@/components/GenrePicker";
import { BOROUGHS, VENUE_TYPES } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your profile — Stagehand" },
      { name: "description", content: "Tell us about your act or your venue." },
    ],
  }),
  component: Onboarding,
});

const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

function getVideoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

function Onboarding() {
  const [role, setRole] = useState<"artist" | "venue" | null>(
    () => (typeof window !== "undefined" ? (sessionStorage.getItem("stagehand-role") as "artist" | "venue" | null) : null),
  );

  if (!role) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-6xl">Who are you?</h1>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <button onClick={() => setRole("artist")} className="poster -rotate-1 bg-primary p-8 text-left text-primary-foreground">
            <div className="font-display text-4xl">Artist</div>
            <p className="mt-2">I play music and want paid gigs.</p>
          </button>
          <button onClick={() => setRole("venue")} className="poster rotate-1 bg-secondary p-8 text-left text-secondary-foreground">
            <div className="font-display text-4xl">Venue</div>
            <p className="mt-2">I run a bar, club or music room and want live acts.</p>
          </button>
        </div>
      </div>
    );
  }
  return role === "artist" ? <ArtistForm /> : <VenueForm />;
}

function ArtistForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [background, setBackground] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickVideo(f: File | undefined) {
    if (!f) return;
    const d = await getVideoDuration(f);
    if (d > 45) {
      toast.error(`That clip is ${Math.round(d)}s. Please keep it around 30 seconds.`);
      return;
    }
    setVideo(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!genres.length) { toast.error("Pick at least one music type."); return; }
    if (!video) { toast.error("Add a ~30 second video of you playing."); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user!;
      const ext = video.name.split(".").pop() || "mp4";
      const path = `${user.id}/clip-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("artist-videos").upload(path, video, { contentType: video.type });
      if (up.error) throw up.error;
      const { error } = await supabase.from("artists").insert({
        user_id: user.id,
        name,
        birthday,
        background,
        genres,
        video_path: path,
        email: user.email ?? null,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("You're on the wall!");
      navigate({ to: "/profile" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="font-display text-6xl">Your act</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Artist / stage name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Birthday</Label>
          <Input required type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Your background</Label>
        <Textarea required rows={4} placeholder="Where you're from, how long you've played, influences…" value={background} onChange={(e) => setBackground(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Music type</Label>
        <GenrePicker value={genres} onChange={setGenres} />
      </div>
      <div className="space-y-2">
        <Label>Video of you playing (~30 seconds)</Label>
        <Input type="file" accept="video/*" onChange={(e) => pickVideo(e.target.files?.[0])} />
        {video && <video src={URL.createObjectURL(video)} controls className="poster-sm mt-2 max-h-72 w-full bg-card" />}
      </div>
      <Button type="submit" size="lg" variant="poster" disabled={busy}>
        {busy ? "Uploading…" : "Publish my profile"}
      </Button>
    </form>
  );
}

function VenueForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", venue_type: "Bar", address: "", borough: "Manhattan", phone: "", email: "" });
  const [genres, setGenres] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!genres.length) { toast.error("Pick at least one music type you want."); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("venues").insert({ ...f, genres, user_id: u.user!.id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/discover" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="font-display text-6xl">Your venue</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Venue name</Label>
          <Input required value={f.name} onChange={set("name")} />
        </div>
        <div className="space-y-1">
          <Label>Type of place</Label>
          <select className={selectCls} value={f.venue_type} onChange={set("venue_type")}>
            {VENUE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Street address</Label>
          <Input required value={f.address} onChange={set("address")} />
        </div>
        <div className="space-y-1">
          <Label>Borough</Label>
          <select className={selectCls} value={f.borough} onChange={set("borough")}>
            {BOROUGHS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input required type="tel" value={f.phone} onChange={set("phone")} />
        </div>
        <div className="space-y-1">
          <Label>Contact email</Label>
          <Input required type="email" value={f.email} onChange={set("email")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Music you're looking for</Label>
        <GenrePicker value={genres} onChange={setGenres} />
      </div>
      <Button type="submit" size="lg" variant="acid" disabled={busy}>
        Start discovering artists
      </Button>
    </form>
  );
}
