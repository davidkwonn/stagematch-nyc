import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function agentTurn(bookingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runAgent } = await import("@/lib/ai/agent.server");
  const { data: b, error } = await supabaseAdmin
    .from("bookings")
    .select("*, artists(name, genres, background), venues(name, venue_type, address, borough, genres)")
    .eq("id", bookingId)
    .single();
  if (error || !b || !b.artists || !b.venues) throw new Error("Booking not found");
  const { data: msgs } = await supabaseAdmin
    .from("booking_messages")
    .select("sender_role, content")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
    .limit(60);
  const { reply, gigDate } = await runAgent(
    {
      artist: b.artists,
      venue: b.venues,
      offer: b.offer_amount,
      gigDate: b.gig_date,
      artistConfirmed: b.artist_confirmed,
      venueConfirmed: b.venue_confirmed,
      today: new Date().toISOString().slice(0, 10),
    },
    (msgs ?? []) as { sender_role: "artist" | "venue" | "agent"; content: string }[],
  );
  if (gigDate && gigDate !== b.gig_date && b.status === "pending") {
    // Date changed: earlier confirmations no longer apply.
    await supabaseAdmin
      .from("bookings")
      .update({ gig_date: gigDate, artist_confirmed: false, venue_confirmed: false })
      .eq("id", bookingId);
  }
  if (reply) {
    await supabaseAdmin.from("booking_messages").insert({ booking_id: bookingId, sender_role: "agent", content: reply });
  }
}

export const claimArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { artistId: string; offer: number }) => {
    const offer = Math.round(Number(input.offer));
    if (!input.artistId || !Number.isFinite(offer) || offer < 1 || offer > 100000) throw new Error("Enter a valid offer");
    return { artistId: input.artistId, offer };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: venue } = await supabase.from("venues").select("id").eq("user_id", userId).maybeSingle();
    if (!venue) throw new Error("Only venues can claim artists");
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("venue_id", venue.id)
      .eq("artist_id", data.artistId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { bookingId: existing.id };
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({ venue_id: venue.id, artist_id: data.artistId, offer_amount: data.offer })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    try {
      await agentTurn(booking.id);
    } catch (e) {
      console.error("agent intro failed", e);
    }
    return { bookingId: booking.id };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string; content: string }) => {
    const content = String(input.content ?? "").trim().slice(0, 2000);
    if (!content) throw new Error("Message is empty");
    return { bookingId: input.bookingId, content };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b } = await supabase
      .from("bookings")
      .select("id, artists(user_id), venues(user_id)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found");
    const role = b.venues?.user_id === userId ? "venue" : b.artists?.user_id === userId ? "artist" : null;
    if (!role) throw new Error("Not part of this booking");
    const { error } = await supabase
      .from("booking_messages")
      .insert({ booking_id: data.bookingId, sender_role: role, sender_id: userId, content: data.content });
    if (error) throw new Error(error.message);
    try {
      await agentTurn(data.bookingId);
    } catch (e) {
      console.error("agent reply failed", e);
      return { ok: true, agentError: true };
    }
    return { ok: true, agentError: false };
  });

export const confirmBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string; decline?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b } = await supabase
      .from("bookings")
      .select("*, artists(user_id, name), venues(user_id, name)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found");
    const role = b.venues?.user_id === userId ? "venue" : b.artists?.user_id === userId ? "artist" : null;
    if (!role) throw new Error("Not part of this booking");
    if (b.status !== "pending") throw new Error("This booking is already settled");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.decline) {
      await supabaseAdmin.from("bookings").update({ status: "declined" }).eq("id", b.id);
      await supabaseAdmin.from("booking_messages").insert({
        booking_id: b.id,
        sender_role: "agent",
        content: `${role === "venue" ? b.venues?.name : b.artists?.name} has passed on this booking. Thanks both — no hard feelings!`,
      });
      return { status: "declined" };
    }
    if (!b.gig_date) throw new Error("Agree on a date with the manager first");
    const patch = role === "venue" ? { venue_confirmed: true } : { artist_confirmed: true };
    const both = (role === "venue" || b.venue_confirmed) && (role === "artist" || b.artist_confirmed);
    await supabaseAdmin.from("bookings").update({ ...patch, ...(both ? { status: "confirmed" } : {}) }).eq("id", b.id);
    await supabaseAdmin.from("booking_messages").insert({
      booking_id: b.id,
      sender_role: "agent",
      content: both
        ? `It's official — ${b.artists?.name} plays ${b.venues?.name} on ${b.gig_date} for $${b.offer_amount}. 🎶`
        : `${role === "venue" ? b.venues?.name : b.artists?.name} confirmed. Waiting on the other side.`,
    });
    return { status: both ? "confirmed" : "pending" };
  });
