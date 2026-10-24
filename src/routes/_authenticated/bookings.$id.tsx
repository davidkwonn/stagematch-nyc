import { createFileRoute, redirect } from '@tanstack/react-router';
import { threadsQuery } from '@/data/threads';
import { pageHead } from '@/data/metadata';
import { requireIntake } from '@/data/navigation';
export const Route=createFileRoute('/_authenticated/bookings/$id')({head:()=>pageHead('Booking details','Your Stagehand gig terms and conversation.'),beforeLoad:async({context,params})=>{await requireIntake(context.queryClient);const threads=await context.queryClient.fetchQuery(threadsQuery);const t=threads.find(t=>t.booking_id===params.id);throw redirect(t?{to:'/inbox/$id',params:{id:t.id}}:{to:'/inbox'});}});
