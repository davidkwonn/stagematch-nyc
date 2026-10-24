import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "@/lib/queries";

// Sends each signed-in person to the right place for their account type.
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Stagehand" }] }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (me.venue) throw redirect({ to: "/discover" });
    if (me.artist) throw redirect({ to: "/profile" });
    throw redirect({ to: "/onboarding" });
  },
});
