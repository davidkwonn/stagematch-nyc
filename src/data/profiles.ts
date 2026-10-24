import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Artist, Venue, Insert, Party, Database } from './types';
export async function getMe() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, artist: null, venue: null };
  const [a,v] = await Promise.all([supabase.from('artists').select('*').eq('user_id',data.user.id).maybeSingle(),supabase.from('venues').select('*').eq('user_id',data.user.id).maybeSingle()]);
  if(a.error) throw a.error; if(v.error) throw v.error;
  return { user:data.user, artist:a.data, venue:v.data };
}
export const meQuery = queryOptions({queryKey:['me'],queryFn:getMe});
export async function currentUser() { const {data,error}=await supabase.auth.getUser(); if(error || !data.user) throw new Error('Please sign in'); return data.user; }
export async function createArtist(input: Omit<Insert<'artists'>,'user_id'>, video: File) { const user=await currentUser(); const path=await uploadMedia(video); const {error}=await supabase.from('artists').insert({...input,user_id:user.id,email:user.email??null,video_path:path}); if(error) throw error; }
export async function createVenue(input: Omit<Insert<'venues'>,'user_id'>) {const user=await currentUser(); const {error}=await supabase.from('venues').insert({...input,user_id:user.id}); if(error) throw error;}
export async function saveProfile(party:Party,id:string,fields:Partial<Artist> & Partial<Venue>) {
  const {name,birthday,background,genres,borough,email,phone,photo_path,video_path,start_date,set_length_min,rate_usd,budget_usd,capacity,goals,venue_type,address,contact_name}=fields;
  const shared={name,genres,borough,email,phone,photo_path,start_date,set_length_min,goals};
  const {error}=party==='artist'? await supabase.from('artists').update(clean({...shared,birthday,background,video_path,rate_usd}) as Database['public']['Tables']['artists']['Update']).eq('id',id):await supabase.from('venues').update(clean({...shared,venue_type,address,contact_name,budget_usd,capacity}) as Database['public']['Tables']['venues']['Update']).eq('id',id); if(error) throw error;
}
export async function uploadMedia(file:File) {const user=await currentUser();const path=`${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabase.storage.from('media').upload(path,file);if(error)throw error;return path;}
export async function signedMediaUrl(path:string|null) {if(!path)return null;const {data,error}=await supabase.storage.from('media').createSignedUrl(path,3600);if(error){const legacy=await supabase.storage.from('artist-videos').createSignedUrl(path,3600);return legacy.data?.signedUrl??null;}return data?.signedUrl??null;}
export async function signOut(){await supabase.auth.signOut();}
export function watchAuth(callback:(event:string)=>void){const {data}=supabase.auth.onAuthStateChange(event=>callback(event));return()=>data.subscription.unsubscribe();}

function clean<T extends object>(value:T){return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));}
