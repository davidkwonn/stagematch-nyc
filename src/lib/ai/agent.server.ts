import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export type AgentContext = {
  artist: { name: string; genres: string[]; background: string };
  venue: { name: string; venue_type: string; address: string; borough: string; genres: string[] };
  offer: number;
  gigDate: string | null;
  artistConfirmed: boolean;
  venueConfirmed: boolean;
  today: string;
};

export type ChatLine = { sender_role: "artist" | "venue" | "agent"; content: string };

function instructions(ctx: AgentContext) {
  return `You are "Mack", the booking manager for Stagehand, a service that books small New York City artists at bars and venues.
You are in a 3-way chat with the ARTIST and the VENUE. Your job: get both sides to agree on a performance date, set length/time, and the pay (the venue's offer is $${ctx.offer}; the artist may counter, you mediate fairly). Keep it friendly, short (2-5 sentences), and practical. Address people by name. Ask one clear question at a time.
When both sides clearly agree on a specific date, include on its own final line exactly: GIG_DATE: YYYY-MM-DD
Once a date and pay are agreed, tell both sides to press "Confirm booking". Payment is handled by Stagehand after both confirm; the artist is paid after the venue confirms the performance happened, otherwise the venue is refunded. Never invent facts about either party.

Today: ${ctx.today}
Artist: ${ctx.artist.name} — styles: ${ctx.artist.genres.join(", ")}. Background: ${ctx.artist.background}
Venue: ${ctx.venue.name} (${ctx.venue.venue_type}), ${ctx.venue.address}, ${ctx.venue.borough}. Looking for: ${ctx.venue.genres.join(", ")}
Current offer: $${ctx.offer}. Agreed date: ${ctx.gigDate ?? "none yet"}. Artist confirmed: ${ctx.artistConfirmed}. Venue confirmed: ${ctx.venueConfirmed}.`;
}

export async function runAgent(ctx: AgentContext, history: ChatLine[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const messages: ModelMessage[] = history.length
    ? history.map((m) =>
        m.sender_role === "agent"
          ? { role: "assistant", content: m.content }
          : { role: "user", content: `[${m.sender_role === "artist" ? ctx.artist.name + " (artist)" : ctx.venue.name + " (venue)"}]: ${m.content}` },
      )
    : [{ role: "user", content: "[system]: The venue just claimed this artist. Introduce yourself to both, summarize the offer, and ask about dates." }];

  const result = streamText({
    // Cast: ai and @ai-sdk/openai pin slightly different provider type versions.
    model: provider.responses(MODEL) as unknown as LanguageModel,
    instructions: instructions(ctx),
    messages,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = (await result.text).trim();
  const match = text.match(/GIG_DATE:\s*(\d{4}-\d{2}-\d{2})/);
  return { reply: text.replace(/\n?GIG_DATE:\s*\d{4}-\d{2}-\d{2}\s*$/m, "").trim(), gigDate: match?.[1] ?? null };
}
