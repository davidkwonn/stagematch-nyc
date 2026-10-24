import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { meQuery } from './profiles';
export async function requireIntake(queryClient:QueryClient){const me=await queryClient.fetchQuery(meQuery);if(!me.artist&&!me.venue)throw redirect({to:'/onboarding'});if(!(me.artist??me.venue)?.intake_completed_at)throw redirect({to:'/intake'});return me;}
