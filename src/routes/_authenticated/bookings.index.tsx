import { createFileRoute, redirect } from '@tanstack/react-router';
import { pageHead } from '@/data/metadata';
export const Route=createFileRoute('/_authenticated/bookings/')({head:()=>pageHead('Bookings inbox','Your Stagehand booking conversations.'),beforeLoad:()=>{throw redirect({to:'/inbox'});}});
