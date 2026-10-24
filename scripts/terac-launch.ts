// Launch the Terac vetting request by hand (prompt 5, step 3): NYC bookers review artist profiles
// on our /review/<token> pages, one task per artist, in a single opportunity.
//
//   deno run -A --env-file=.env.local scripts/terac-launch.ts price [--artists 10] [--reviewers 1]
//   deno run -A --env-file=.env.local scripts/terac-launch.ts status <feasibility_id>
//   deno run -A --env-file=.env.local scripts/terac-launch.ts launch --app-url https://<app> --tokens t1,t2,... \
//        [--reviewers 1] [--feasibility <id>] [--confirm]
//
// `launch` creates a draft and prints it; with --confirm it also launches (this spends money).
// One reviewer per artist is the default: the review page accepts one verdict per link.

const BASE = 'https://terac.com/api/external/v2';
const PROJECT_NAME = 'Stagehand artist vetting';
const MINUTES_PER_ARTIST = 2;
const RECRUIT_DAYS = 5;
const TIMELINE_HOURS = 6;

const key = Deno.env.get('TERAC_API_KEY');
if (!key) {
  console.error('TERAC_API_KEY missing: run with --env-file=.env.local');
  Deno.exit(1);
}

async function terac<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`terac ${method} ${path} ${res.status}: ${text.slice(0, 800)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function flag(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}
const intFlag = (name: string, fallback: number) => Number(flag(name) ?? fallback) || fallback;

const TASK =
  'Review short profiles of emerging New York City musicians for a live-music booking platform. ' +
  'For each artist, open their profile page (bio, genres, rate, availability, performance clip if any) and answer on the page: ' +
  `would you book this artist (yes/no), which kinds of rooms fit them, and a one-line note. About ${MINUTES_PER_ARTIST} minutes per artist.`;
const PANEL =
  'Experienced New York City talent buyers or music bookers: people who book live music for bars, clubs, ' +
  'music venues or restaurants in NYC now or in the last two years. Exclude people with no booking experience.';

type Feasibility = { id: string; status: string; costPerParticipant: number | null; dashboard_url?: string | null };
type Opportunity = { id: string; status: string; dashboard_url?: string | null; draft_editor?: string | null };

async function price() {
  const artists = intFlag('artists', 10);
  const reviewers = intFlag('reviewers', 1);
  const f = await terac<Feasibility>('POST', '/feasibility/requests', {
    taskDescription: TASK,
    panelDescription: PANEL,
    submissionCount: reviewers,
    timelineHours: TIMELINE_HOURS,
    loiMinutes: artists * MINUTES_PER_ARTIST,
    payRateFrequency: 'ONE_TIME',
  });
  console.log(`feasibility ${f.id}: ${f.status}, cost per reviewer: ${f.costPerParticipant ?? 'pending'}`);
  if (f.dashboard_url) console.log(f.dashboard_url);
  console.log(`check again: deno run -A --env-file=.env.local scripts/terac-launch.ts status ${f.id}`);
}

async function status(id: string | undefined) {
  if (!id) throw new Error('usage: status <feasibility_id>');
  const f = await terac<Feasibility>('GET', `/feasibility/requests/${id}`);
  console.log(`feasibility ${f.id}: ${f.status}, cost per reviewer: ${f.costPerParticipant ?? 'pending'}`);
}

async function projectId(): Promise<string> {
  const list = await terac<{ data: { id: string; name: string }[] }>('GET', '/projects');
  const found = list.data?.find(p => p.name === PROJECT_NAME);
  if (found) return found.id;
  return (await terac<{ id: string }>('POST', '/projects', { name: PROJECT_NAME })).id;
}

async function launch() {
  const appUrl = flag('app-url')?.replace(/\/$/, '');
  const tokens = (flag('tokens') ?? '').split(',').map(t => t.trim()).filter(t => /^[0-9a-f]{32}$/i.test(t));
  if (!appUrl?.startsWith('https://') || !tokens.length) throw new Error('need --app-url https://… and --tokens with 32-hex review tokens');
  const reviewers = intFlag('reviewers', 1);
  const feasibility = flag('feasibility');

  const draft = await terac<Opportunity>('POST', '/opportunities', {
    title: 'Would you book these emerging NYC artists?',
    internal_title: `Stagehand vetting: ${tokens.length} artists`,
    description: TASK,
    project_id: await projectId(),
    num_participants: reviewers,
    business_type: 'b2b',
    customer_screening_review: 'auto_invite',
    expected_days_to_complete: RECRUIT_DAYS,
    unrestricted_audience: true,
    ...(feasibility && { feasibility_request_id: feasibility }),
    screening_questions: [{
      key: 'booker',
      text: 'Have you booked live music for a New York City bar, club or venue in the last two years?',
      pick: 'one',
      answers: [
        { text: 'Yes, it is (or was) part of my job', qualify_logic: 'may' },
        { text: 'No', qualify_logic: 'reject' },
      ],
    }],
    tasks: tokens.map((token, i) => ({
      sequence: i + 1,
      task_type: 'interview',
      review_type: 'manual_review',
      task_url: `${appUrl}/review/${token}`,
      title: `Artist ${i + 1} of ${tokens.length}`,
      description: 'Open the profile, then answer yes or no, pick the rooms that fit, add a one-line note and submit.',
      duration_minutes: MINUTES_PER_ARTIST,
    })),
  });
  console.log(`draft opportunity ${draft.id}: ${draft.status}`);
  if (draft.draft_editor ?? draft.dashboard_url) console.log(draft.draft_editor ?? draft.dashboard_url);
  if (!Deno.args.includes('--confirm')) {
    console.log('Not launched. Review the draft, then re-run with --confirm to launch (this spends money).');
    return;
  }
  const live = await terac<Opportunity>('POST', `/opportunities/${draft.id}/launch`, {});
  console.log(`launched ${live.id}: ${live.status}`);
  if (live.dashboard_url) console.log(live.dashboard_url);
}

const command = Deno.args[0];
if (command === 'price') await price();
else if (command === 'status') await status(Deno.args[1]);
else if (command === 'launch') await launch();
else console.log('usage: price | status <id> | launch --app-url … --tokens … [--confirm]');
