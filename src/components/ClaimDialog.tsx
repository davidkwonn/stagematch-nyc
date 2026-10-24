import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { claimArtist } from "@/lib/bookings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";

export function ClaimDialog({ artistId, artistName, trigger }: { artistId: string; artistName: string; trigger: React.ReactNode }) {
  const [offer, setOffer] = useState("200");
  const [busy, setBusy] = useState(false);
  const claim = useServerFn(claimArtist);
  const navigate = useNavigate();

  async function go() {
    setBusy(true);
    try {
      const r = await claim({ data: { artistId, offer: Number(offer) } });
      navigate({ to: "/bookings/$id", params: { id: r.bookingId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not claim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="poster bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl">Claim {artistName}</DialogTitle>
          <DialogDescription>
            Make an offer for one performance. Our AI manager will reach out to both of you to lock in the date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Your offer (USD)</Label>
          <Input type="number" min={1} value={offer} onChange={(e) => setOffer(e.target.value)} />
        </div>
        <Button variant="poster" disabled={busy} onClick={go}>
          {busy ? "Calling the manager…" : "Claim & send offer"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
