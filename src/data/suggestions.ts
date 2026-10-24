import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Suggestion } from './types';
export const suggestionsQuery=(id:string)=>queryOptions({queryKey:['suggestions',id],queryFn:async()=>{const{data,error}=await supabase.from('suggestions').select('*,artists(*)').eq('venue_id',id).eq('status','suggested').order('score',{ascending:false});if(error)throw error;return(data??[]) as Suggestion[];}});
