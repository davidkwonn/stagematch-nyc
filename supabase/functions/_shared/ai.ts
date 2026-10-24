// OpenAI-compatible Chat Completions with a small tool loop.
// AI_BASE_URL / AI_API_KEY / AI_MODEL: Lovable AI gateway or OpenAI, same code.

export type Msg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: any) => Promise<unknown>;
};

export async function chat(messages: Msg[], tools: Tool[] = []) {
  const res = await fetch(`${Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('AI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('AI_MODEL') ?? 'gpt-5.6-terra',
      messages,
      ...(tools.length && {
        tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      }),
    }),
  });
  if (!res.ok) throw new Error(`ai ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
}

// Runs tools until the model answers in text (max `steps` rounds). Returns the final text.
export async function runWithTools(messages: Msg[], tools: Tool[], steps = 5): Promise<string> {
  const convo = [...messages];
  for (let i = 0; i < steps; i++) {
    const reply = await chat(convo, tools);
    if (!reply.tool_calls?.length) return reply.content ?? '';
    convo.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls });
    for (const call of reply.tool_calls) {
      const tool = tools.find(t => t.name === call.function.name);
      let result: unknown;
      try {
        result = tool ? await tool.run(JSON.parse(call.function.arguments || '{}')) : { error: 'unknown tool' };
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result ?? { ok: true }) });
    }
  }
  return '';
}
