import Exa from "exa-js";
import { requireEnv } from "./env";

let client: Exa | undefined;

function exa(): Exa {
  client ??= new Exa(requireEnv("EXA_API_KEY"));
  return client;
}

export interface WebResult {
  title: string | null;
  url: string;
  text: string;
}

/** Web search with page text, used by the venue agent to find and enrich venues. */
export async function searchWeb(query: string, numResults = 8): Promise<WebResult[]> {
  const response = await exa().search(query, {
    numResults,
    type: "auto",
    contents: { text: { maxCharacters: 3000 } },
  });
  return response.results.map((r) => ({ title: r.title ?? null, url: r.url, text: r.text ?? "" }));
}
