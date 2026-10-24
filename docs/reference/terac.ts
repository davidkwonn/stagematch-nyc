import { db } from "./db";
import { logDecision, type AgentName } from "./decisions";

/**
 * Human-in-the-loop via Terac.
 *
 * STUB: agents queue questions in `human_tasks`. For now the team launches them on Terac from
 * Claude Code through the Terac MCP (terac_request_feasibility -> terac_launch_draft_opportunity
 * -> terac_get_submissions) and writes answers back with `recordHumanAnswer`.
 *
 * TODO(terac owner): if Terac's REST API (https://terac.com/api/external/v2, API key auth) can
 * create and launch opportunities, call it here so agents escalate without a person in between.
 */
export async function requestHumanInput(
  agent: AgentName,
  kind: "escalation" | "study" | "review",
  question: string,
  payload?: unknown,
): Promise<string> {
  const { data, error } = await db()
    .from("human_tasks")
    .insert({ kind, question, payload: payload ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logDecision(agent, "human_input_requested", question, { human_task_id: data.id, kind }, true);
  return data.id as string;
}

export async function recordHumanAnswer(humanTaskId: string, result: unknown, teracRef?: string): Promise<void> {
  const { error } = await db()
    .from("human_tasks")
    .update({ status: "answered", result, terac_ref: teracRef ?? null })
    .eq("id", humanTaskId);
  if (error) throw new Error(error.message);
  await logDecision("system", "human_input_received", `Human answer recorded for task ${humanTaskId}`, { result });
}
