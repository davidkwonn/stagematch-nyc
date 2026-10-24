// Terac REST client (https://terac.com/api/external/v2/openapi.json).
// Flow: project → draft opportunity → launch → submissions → approve.

const BASE = 'https://terac.com/api/external/v2';
const PROJECT_NAME = 'Stagehand artist vetting';
const REVIEW_MINUTES = 5;
const RECRUIT_DAYS = 5;

export const teracSimulated = () => Deno.env.get('TERAC_SIMULATE') === 'true' || !Deno.env.get('TERAC_API_KEY');

// expert_reviews.terac_opportunity_id for reviews the simulator answers. Seeded pending
// reviews have no opportunity, so they stay "Review pending" for the demo.
export const SIMULATED_OPPORTUNITY = 'simulated';

async function terac<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get('TERAC_API_KEY')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`terac ${method} ${path} ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Project = { id: string; name: string };
type Opportunity = { id: string; status: string; dashboard_url?: string | null };
export type Submission = { id: string; opportunity_id: string; status: string; participant_name: string | null };

// TERAC_PROJECT_ID, else the project named PROJECT_NAME, else a new one.
export async function projectId(): Promise<string> {
  const fixed = Deno.env.get('TERAC_PROJECT_ID');
  if (fixed) return fixed;
  const list = await terac<{ data: Project[] }>('GET', '/projects');
  const found = list.data?.find(p => p.name === PROJECT_NAME);
  if (found) return found.id;
  return (await terac<Project>('POST', '/projects', { name: PROJECT_NAME })).id;
}

// Optional hard filters as JSON (ids from GET /filters), e.g. a New York state/city filter.
function audience(): Record<string, unknown> {
  const raw = Deno.env.get('TERAC_FILTERS');
  if (raw) return { filters: JSON.parse(raw) };
  return { unrestricted_audience: true };
}

// One opportunity per artist: each review page is its own task URL.
export async function launchReview(opts: { artistName: string; reviewUrl: string; reviewers: number }): Promise<Opportunity> {
  const draft = await terac<Opportunity>('POST', '/opportunities', {
    title: 'Would you book this emerging NYC artist?',
    internal_title: `Stagehand vetting: ${opts.artistName}`,
    description:
      'You are an experienced New York talent buyer or music booker. Open the artist profile, watch the video, ' +
      'and tell us: would you book this artist (yes/no), which kinds of rooms fit them, and a one-line note.',
    project_id: await projectId(),
    num_participants: opts.reviewers,
    business_type: 'b2b',
    customer_screening_review: 'auto_invite',
    expected_days_to_complete: RECRUIT_DAYS,
    ...audience(),
    screening_questions: [{
      key: 'booker',
      text: 'Have you booked live music for a New York City bar, club or venue in the last two years?',
      pick: 'one',
      answers: [
        { text: 'Yes, it is (or was) part of my job', qualify_logic: 'may' },
        { text: 'No', qualify_logic: 'reject' },
      ],
    }],
    tasks: [{
      sequence: 1,
      task_type: 'interview',
      review_type: 'manual_review',
      task_url: opts.reviewUrl,
      title: 'Review one artist profile',
      description: 'Open the profile, watch the clip, answer three short questions and submit on the page.',
      duration_minutes: REVIEW_MINUTES,
    }],
  });
  return await terac<Opportunity>('POST', `/opportunities/${draft.id}/launch`, {});
}

export async function submissions(opportunityId: string): Promise<Submission[]> {
  return (await terac<{ data: Submission[] }>('GET', `/opportunities/${opportunityId}/submissions`)).data ?? [];
}

export async function approve(submissionId: string): Promise<void> {
  await terac('POST', `/submissions/${submissionId}/approve`, {});
}
