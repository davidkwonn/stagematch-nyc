import { supabase } from '@/integrations/supabase/client';
export function subscribeLive(onChange:()=>void, tables=['threads','messages','suggestions','bookings','payments','availability']) {
 let channel=supabase.channel(`stagehand-${Math.random().toString(36).slice(2)}`);
 for(const table of tables)channel=channel.on('postgres_changes',{event:'*',schema:'public',table},onChange);
 channel.subscribe();return()=>{void supabase.removeChannel(channel);};
}
