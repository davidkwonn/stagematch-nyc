import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSession, onIdentity, signIn, signUp } from "@/data/auth";
import { lovable } from "@/integrations/lovable/index";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    as: s["as"] === "venue" || s["as"] === "artist" ? (s["as"] as "venue" | "artist") : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Stagehand" },
      { name: "description", content: "Sign in or create your Stagehand artist or venue account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Sign in — Stagehand" },
      { property: "og:description", content: "Sign in or create your Stagehand artist or venue account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { as } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(as ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (as) sessionStorage.setItem("stagehand-role", as);
    getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home" });
    });
    return onIdentity(() => navigate({ to: "/home" }));
  }, [as, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const data = await signUp(email, password);
        if (!data.session) toast.success("Check your email to confirm your account.");
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error("Google sign-in failed");
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="poster bg-card p-8">
          <h1 className="font-display text-5xl">{mode === "signup" ? "Join the bill" : "Welcome back"}</h1>
          {as && (
            <p className="mt-2 text-sm text-muted-foreground">
              Signing up as {as === "artist" ? "an artist" : "a venue"}.
            </p>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" variant="poster" className="w-full" disabled={busy}>
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <Button variant="paper" className="mt-3 w-full" onClick={google}>
            Continue with Google
          </Button>
          <button
            className="mt-6 text-sm text-muted-foreground underline"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
