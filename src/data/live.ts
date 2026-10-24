import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { publicAction } from './backend.functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { Json } from '@/integrations/supabase/types';
export const liveQuery=queryOptions({queryKey:['live'],queryFn:async()=>{const[logs,stats]=await Promise.all([supabase.from('agent_log').select('*').order('at',{ascending:false}).limit(100),publicAction({data:{action:'live'}})]);if(logs.error)throw logs.error;return{logs:logs.data??[],stats:stats.stats};}});
export async function logDecision(agent:string,action:string,detail:Json={},client:SupabaseClient<Database>=supabase) {const{error}=await client.from('agent_log').insert({agent,action,detail});if(error)throw error;}
