import { createFileRoute } from '@tanstack/react-router';
import { threadQuery } from '@/data/threads';
import { requireIntake } from '@/data/navigation';
import { pageHead } from '@/data/metadata';
import { ThreadChat } from '@/features/chat/ThreadChat';
export const Route=createFileRoute('/_authenticated/inbox/$id')({head:()=>pageHead('Conversation with Mack','Work out dates, set lengths and pay in your Stagehand conversation.'),beforeLoad:({context})=>requireIntake(context.queryClient),loader:({context,params})=>context.queryClient.ensureQueryData(threadQuery(params.id)),component:()=>{const{id}=Route.useParams();return <main className="app-page"><div className="mx-auto max-w-4xl"><ThreadChat id={id}/></div></main>;}});
