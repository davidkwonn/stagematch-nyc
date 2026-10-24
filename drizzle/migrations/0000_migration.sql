CREATE TABLE public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  birthday date NOT NULL,
  background text NOT NULL DEFAULT '',
  genres text[] NOT NULL DEFAULT '{}',
  video_path text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;
GRANT ALL ON public.artists TO service_role;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in can view artists" ON public.artists FOR SELECT TO authenticated USING (true);
CREATE POLICY "own artist insert" ON public.artists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own artist update" ON public.artists FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own artist delete" ON public.artists FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  venue_type text NOT NULL DEFAULT 'Bar',
  address text NOT NULL,
  borough text NOT NULL DEFAULT 'Manhattan',
  genres text[] NOT NULL DEFAULT '{}',
  phone text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in can view venues" ON public.venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "own venue insert" ON public.venues FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own venue update" ON public.venues FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own venue delete" ON public.venues FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  liked boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, artist_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swipes TO authenticated;
GRANT ALL ON public.swipes TO service_role;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue owns swipes" ON public.swipes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.user_id = auth.uid()));

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  offer_amount integer NOT NULL CHECK (offer_amount > 0),
  status text NOT NULL DEFAULT 'pending',
  gig_date date,
  artist_confirmed boolean NOT NULL DEFAULT false,
  venue_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_booking_party(_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    LEFT JOIN public.venues v ON v.id = b.venue_id
    LEFT JOIN public.artists a ON a.id = b.artist_id
    WHERE b.id = _booking_id AND (v.user_id = auth.uid() OR a.user_id = auth.uid())
  )
$$;

CREATE POLICY "parties view bookings" ON public.bookings FOR SELECT TO authenticated USING (public.is_booking_party(id));
CREATE POLICY "venue creates booking" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.user_id = auth.uid()) AND status = 'pending' AND NOT artist_confirmed AND NOT venue_confirmed);

CREATE TABLE public.booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('artist','venue','agent')),
  sender_id uuid,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.booking_messages TO authenticated;
GRANT ALL ON public.booking_messages TO service_role;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view messages" ON public.booking_messages FOR SELECT TO authenticated USING (public.is_booking_party(booking_id));
CREATE POLICY "parties post messages" ON public.booking_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND sender_role <> 'agent' AND public.is_booking_party(booking_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

CREATE POLICY "signed in read artist videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'artist-videos');
CREATE POLICY "artist uploads own video" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artist-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "artist updates own video" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'artist-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "artist deletes own video" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'artist-videos' AND (storage.foldername(name))[1] = auth.uid()::text);