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
- Account type is derived from which row exists (`artists` or `venues` keyed by user_id); `/home` redirects accordingly — keeps one auth flow for both sides.
- Booking state changes (confirm/decline, agent messages, gig_date) go through server functions in `src/lib/bookings.functions.ts` using the admin client after verifying the caller is a party — bookings have no client UPDATE policy so users can't self-confirm the other side.
- The AI manager lives in `src/lib/ai/agent.server.ts`; it signals an agreed date with a trailing `GIG_DATE: YYYY-MM-DD` line that the server parses and strips — avoids a tool loop for one field.
- Artist videos live in the private `artist-videos` bucket under `{user_id}/`; viewers use signed URLs.
