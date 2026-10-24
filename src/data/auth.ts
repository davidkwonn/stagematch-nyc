import { supabase } from '@/integrations/supabase/client';
export async function getSession(){return supabase.auth.getSession();}
export function onIdentity(callback:()=>void){const{data}=supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN')callback();});return()=>data.subscription.unsubscribe();}
export async function signIn(email:string,password:string){const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
export async function signUp(email:string,password:string){const{data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/auth'}});if(error)throw error;return data;}
