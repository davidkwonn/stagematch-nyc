<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Derive account type from the artists or venues row keyed by user_id; gate content routes with the shared intake helper so signup and required intake remain one flow.
- Components use only src/data domain modules, never database clients; the integration-managed auth layout is the sole exception because its auth gate is platform-owned.
- Export backend actions exclusively through src/data/api.ts with the documented edge-function comments and signatures; this is the single teammate replacement boundary.
- Current privileged implementation uses authenticated TanStack server functions plus server-only helpers, verifying party ownership before admin writes; this keeps the Lovable Worker deployment supported.
- Mack instructions live in src/data/mack-prompt.ts, with structured extraction in a server-only helper; user messages cannot set statuses, confirmations, vetting or payments.
- Use atomic database confirmation for both-party agreement and reset confirmations when negotiated terms change, preventing parallel confirmations from losing updates.
- Private media is in media under user_id/filename and read with signed URLs; legacy artist-videos remains read-compatible until existing media is migrated.
- Shared schema changes are additive; keep deprecated legacy tables and columns unused, and document contract differences in HACKATHON_HANDOFF.md to avoid breaking existing live data.
- Voice transport is replaced only in src/features/voice/voice-client.ts; the stub must not claim a connected call.
- Payment provider acknowledgements are required before held, released or refunded states; never simulate a charge or payout.
- Keep inbox as an Outlet parent with separate index and conversation children so changing the URL renders the intended screen.

## Team rules

Team ownership, git flow and Edge Function conventions: `CLAUDE.md`. Spec: `docs/SPEC.md`.
