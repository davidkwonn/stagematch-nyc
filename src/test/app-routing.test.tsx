import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it("matches an inbox conversation rather than leaving the thread list on screen", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/inbox/9c136869-4582-4bea-9fc6-13c6318d8dcf");
    expect(matches.at(-1)?.routeId).toBe("/_authenticated/inbox/$id");
    expect(router.matchRoutes("/inbox").at(-1)?.routeId).toBe("/_authenticated/inbox/");
  });
});
