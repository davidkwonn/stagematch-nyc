import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Thread } from './types';
export const threadsQuery=queryOptions({queryKey:['threads'],queryFn:async()=>{const{data,error}=await supabase.from('threads').select('*, artists(*), venues(*), messages(*)').order('last_message_at',{ascending:false});if(error)throw error;return (data??[]) as Thread[];}});
export const threadQuery=(id:string)=>queryOptions({queryKey:['thread',id],queryFn:async()=>{const[{data,error},msgs]=await Promise.all([supabase.from('threads').select('*,artists(*),venues(*)').eq('id',id).single(),supabase.from('messages').select('*').eq('thread_id',id).order('created_at')]);if(error)throw error;if(msgs.error)throw msgs.error;return {...data,messages:msgs.data??[]} as Thread;}});
export function unreadThread(id:string,last:string){return typeof window!=='undefined' && last>(localStorage.getItem(`stagehand-read-${id}`)??'');}
export function markThreadRead(id:string){localStorage.setItem(`stagehand-read-${id}`,new Date().toISOString());}
