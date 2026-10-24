import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { data } = useQuery(meQuery);
  const navigate = useNavigate();
  const signedIn = !!data?.user;

  return (
    <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="font-display text-2xl text-foreground">
          Stage<span className="text-primary">hand</span>
          <span className="ml-2 align-middle font-sans text-[10px] tracking-widest text-secondary">NYC</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {signedIn ? (
            <>
              {data?.venue && (
                <Link to="/discover" className="px-2 py-1 font-bold uppercase hover:text-primary">
                  Discover
                </Link>
              )}
              {data?.artist && (
                <Link to="/profile" className="px-2 py-1 font-bold uppercase hover:text-primary">
                  My profile
                </Link>
              )}
              <Link to="/bookings" className="px-2 py-1 font-bold uppercase hover:text-primary">
                Bookings
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="poster">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
