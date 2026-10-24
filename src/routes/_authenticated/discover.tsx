import { createFileRoute, redirect } from '@tanstack/react-router';
import { pageHead } from '@/data/metadata';
export const Route=createFileRoute('/_authenticated/discover')({head:()=>pageHead('Artist suggestions','Mack’s picks for your NYC venue.'),beforeLoad:()=>{throw redirect({to:'/home'});}});
