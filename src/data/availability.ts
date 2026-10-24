import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Availability, Insert, Party } from './types';
export const availabilityQuery=(party:Party,id:string)=>queryOptions({queryKey:['availability',party,id],queryFn:async()=>{const{data,error}=await supabase.from('availability').select('*').eq('owner_type',party).eq('owner_id',id).order('start_time');if(error)throw error;return data;}});
export async function saveSlot(slot:Insert<'availability'>){validateSlot(slot);const{error}=slot.id?await supabase.from('availability').update({...slot,source:'manual'}).eq('id',slot.id):await supabase.from('availability').insert({...slot,source:'manual'});if(error)throw error;}
export async function deleteSlot(id:string){const{error}=await supabase.from('availability').delete().eq('id',id);if(error)throw error;}
export function validateSlot(slot:Pick<Insert<'availability'>,'kind'|'date'|'weekday'|'start_time'|'end_time'>){if(slot.kind==='date'&&!slot.date)throw new Error('Choose a date');if(slot.kind==='weekly'&&(slot.weekday==null||slot.weekday<0||slot.weekday>6))throw new Error('Choose a weekday');if(!slot.start_time||!slot.end_time||slot.end_time<=slot.start_time)throw new Error('End time must be later than start time');}
export function slotsOnDay(slots:Availability[],day:string){const weekday=new Date(`${day}T12:00:00`).getDay();return slots.filter(s=>s.kind==='date'?s.date===day:s.weekday===weekday);}
