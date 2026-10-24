import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { meQuery } from '@/data/profiles';
import { startMack } from '@/data/api';
import { threadQuery } from '@/data/threads';
import { pageHead } from '@/data/metadata';
import { ThreadChat } from '@/features/chat/ThreadChat';
export const Route=createFileRoute('/_authenticated/intake')({head:()=>pageHead('Intake with Mack','Set up your NYC gig calendar with Mack.'),loader:async({context})=>{const me=await context.queryClient.fetchQuery(meQuery);if(!me.artist&&!me.venue)throw redirect({to:'/onboarding'});const {thread_id}=await startMack(me.artist?'artist':'venue');await context.queryClient.ensureQueryData(threadQuery(thread_id));return{thread_id};},component:Intake});
function Intake(){const{thread_id}=Route.useLoaderData();const{data:me}=useSuspenseQuery(meQuery);const complete=!!(me.artist??me.venue)?.intake_completed_at;const navigate=useNavigate();useEffect(()=>{if(!complete)return;const timer=setTimeout(()=>navigate({to:'/calendar'}),1400);return()=>clearTimeout(timer);},[complete,navigate]);return <main className="app-page"><div className="mx-auto max-w-3xl">{complete?<div className="py-20 text-center"><CheckCircle2 className="mx-auto mb-6 size-16 text-mint"/><h1 className="font-display text-5xl">You're on the calendar.</h1><p className="mt-4 text-muted-foreground">Your next gig starts here.</p></div>:<ThreadChat id={thread_id} intake/>}</div></main>;}
