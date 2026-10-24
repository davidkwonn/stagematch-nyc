import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) return { user: null, artist: null, venue: null };
    const [{ data: artist }, { data: venue }] = await Promise.all([
      supabase.from("artists").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("venues").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    return { user, artist, venue };
  },
});

export const bookingsQuery = queryOptions({
  queryKey: ["bookings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, artists(id, name, genres), venues(id, name, borough, venue_type)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export async function signedVideoUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("artist-videos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
