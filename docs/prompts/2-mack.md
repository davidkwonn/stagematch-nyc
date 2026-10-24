# Prompt 2 — Mack: chat + voice on one shared conversation

> Paste into Claude Code at the root of the repo, on your branch (see `CLAUDE.md`). Owner: the voice teammate.

---

You build Mack, Stagehand's AI booking manager, in text and in voice, on one shared conversation. Read `docs/SPEC.md` (section "Shared context between chat and voice") and `docs/reference/stagehand-contract.sql`. You own `supabase/functions/mack-start`, `mack-chat`, `voice-session`, `voice-turns`, `supabase/functions/_shared/mack/`, and the browser client `voice-client.ts`. Code freeze 17:30. Rules, owners and git flow: `AGENTS.md`.

## Principle

The context lives in the database. A thread's `messages` hold text and voice turns (`channel`). Both modes build their context the same way, from one module:

- `_shared/mack/prompt.ts` — Mack's persona and rules, one per mode and thread kind (manager intake artist, manager intake venue, manager after intake, booking thread). Write rules as what to do; each rule in one place.
- `_shared/mack/context.ts` — `buildContext(thread_id)`: the party's profile (no email/phone), their availability, `mack_notes`, the booking and the other party for booking threads, and the last 40 messages of the thread (text and voice).

## Text agent

- `mack-start` `{ party }` → `{ thread_id }`: get or create the caller's manager thread; if empty, post Mack's opener for intake.
- `mack-chat` `{ thread_id, content }` → `{ message_id }`: check the caller is a party (`is_thread_party` logic), insert their message, then run Mack: `chat()` from `_shared/ai.ts` with the context and these tools, and post its reply with `postAgentMessage`:
  - `save_availability({ slots: [{ kind: 'date'|'weekly', date?, weekday?, start_time, end_time, note? }] })` → `availability` rows, `source` = 'chat' or 'voice'
  - `update_profile({ start_date?, set_length_min?, rate_usd?, budget_usd?, capacity?, goals? })`
  - `complete_intake()` → `intake_completed_at`; venue → invoke `match` and present the top 3 in the thread; artist → invoke `terac-submit`
  - `set_booking_terms({ gig_date?, start_time?, set_length_min?, offer_usd? })` in booking threads; any change resets `artist_confirmed` and `venue_confirmed` to false; when both sides agree, tell them to press Confirm
  - `add_note({ note })` → `mack_notes` (facts worth remembering across threads)
- In booking threads Mack answers when addressed or when terms move; artist and venue also talk to each other directly.
- Every tool call → `log('mack', <tool>, detail)`.
- Model: `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` (Lovable AI gateway or OpenAI, same code).

## Voice

Start from our v3 voice lab: `/Users/sublime/conductor/workspaces/Cowork/washington/prototypes/v3/demo` (`voice/provider.mjs` session creation, `voice/configuration.mjs` data channel events, `voice/browser.mjs` WebRTC client, `live-transcripts.mjs` transcript fragments, `assistant/prompts.mjs` instruction assembly). Keep the base, drop the Voice Gateway, sideband and observer.

- `voice-session` `{ thread_id, sdp }` → `{ sdp, greeting }`: same caller check, `buildContext(thread_id)` + the voice variant of the prompt, then `POST https://api.openai.com/v1/live/sessions` with `{ session: { model: 'gpt-live-1', store: false, delegation: { type: 'client' }, audio: { output: { voice: 'marin' } }, instructions, client: { data_channel: { allowed_client_events: [session.instructions.append, session.close], allowed_server_events: [session.started, session.closed, session.usage.updated, session.input_transcript.delta, session.output_transcript.delta, error] } } }, transport: { type: 'webrtc', sdp } }`. The greeting continues the conversation when the thread already has messages ("Picking up where we left off…").
- Browser client, `voice-client.ts`, with the interface the Lovable UI expects: `createVoiceClient()` → `start(thread_id, { onTurn, onState })`, `stop()`, `mute(on)`. Mic + `RTCPeerConnection` + data channel `oai-events`; on `session.started` send the greeting with `session.instructions.append` (check the data channel accepts it; otherwise put the greeting at the end of the instructions); build turns from the transcript deltas; on each finished turn call `onTurn` and post it to `voice-turns` (batch every few seconds). Must start from a tap (iOS Safari), work on mobile Chrome and Safari.
- `voice-turns` `{ thread_id, turns }` → insert as `messages` with `channel = 'voice'` (`sender_role` = the caller's party or 'agent'), then run the text agent once over the new user turns in "process only" mode: tools allowed, no reply posted. That's how data said by voice gets saved.

## Done when

On a phone: a venue starts intake by voice, says its nights and budget, switches to chat mid-conversation, Mack continues with full context, the calendar shows the slots (source Voice and Chat), and completing intake posts 3 artist suggestions in the thread.
