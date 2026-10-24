import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, CalendarDays, MapPin, Music2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { meQuery, signedMediaUrl } from '@/data/profiles';
import { suggestionsQuery } from '@/data/suggestions';
import { decideSuggestion } from '@/data/api';
import { requireIntake } from '@/data/navigation';
import { pageHead } from '@/data/metadata';
import { Button } from '@/components/ui/button';

export const Route=createFileRoute('/_authenticated/artist/$id')({
 head:()=>pageHead('Artist profile','Watch their set and confirm them for your venue.'),
 validateSearch:(search:Record<string,unknown>)=>({suggestion:typeof search['suggestion']==='string'?search['suggestion']:''}),
 beforeLoad:({context})=>requireIntake(context.queryClient),
 loader:async({context})=>{const me=await context.queryClient.ensureQueryData(meQuery);if(me.venue)await context.queryClient.ensureQueryData(suggestionsQuery(me.venue.id));},
 component:ArtistProfile,
});

function ArtistProfile(){
 const{id}=Route.useParams();const{suggestion:suggestionId}=Route.useSearch();const{data:me}=useSuspenseQuery(meQuery);const{data:suggestions}=useSuspenseQuery(suggestionsQuery(me.venue?.id??''));const qc=useQueryClient();const navigate=useNavigate();
 const s=suggestions.find(x=>x.artists?.id===id)??null;const a=s?.artists??null;
 const[photo,setPhoto]=useState<string|null>(null);const[video,setVideo]=useState<string|null>(null);const[busy,setBusy]=useState(false);
 useEffect(()=>{signedMediaUrl(a?.photo_path??null).then(setPhoto);signedMediaUrl(a?.video_path??null).then(setVideo);},[a?.photo_path,a?.video_path]);
 if(!me.venue)return <main className="app-page"><p className="text-sm text-muted-foreground">Only venues can view artist profiles.</p></main>;
 if(!a||!s)return <main className="app-page"><div className="mx-auto max-w-2xl py-20 text-center"><Music2 className="mx-auto size-12 text-primary"/><h1 className="mt-6 font-display text-4xl">Artist not found.</h1><p className="mt-3 text-sm text-muted-foreground">They may no longer be on your list.</p><Button asChild variant="acid" className="mt-6"><Link to="/home">Back to your picks</Link></Button></div></main>;
 async function confirm(){if(busy)return;setBusy(true);try{const r=await decideSuggestion(suggestionId||s!.id,'yes');await qc.invalidateQueries();toast.success('Confirmed — Mack is connecting you both');if(r.thread_id)navigate({to:'/inbox/$id',params:{id:r.thread_id}});else navigate({to:'/inbox'});}catch(e){toast.error(e instanceof Error?e.message:'Could not confirm artist');}finally{setBusy(false);}}
 return <main className="app-page"><div className="mx-auto max-w-3xl">
  <Button asChild variant="ghost" size="sm"><Link to="/home"><ArrowLeft className="size-4"/>Back to your picks</Link></Button>
  <div className="mt-6 grid gap-8 md:grid-cols-2">
   <div className="border-2 border-foreground bg-card">
    <div className="relative aspect-[4/5] overflow-hidden bg-muted">
     {video?<video src={video} poster={photo??undefined} controls playsInline preload="metadata" className="h-full w-full object-cover"/>:photo?<img src={photo} alt={a.name} width={640} height={800} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center bg-accent font-display text-8xl text-accent-foreground">{a.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>}
     <span className="absolute left-3 top-3 bg-secondary px-2 py-1 text-[10px] font-bold text-secondary-foreground">{s.score}% MATCH</span>
    </div>
   </div>
   <div>
    <p className="eyebrow">Mack's pick for {me.venue.name}</p>
    <h1 className="page-title">{a.name}<span className="text-primary">.</span></h1>
    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4"/>{a.borough??'NYC'} · <Music2 className="size-4"/>{a.genres.join(' · ')}</p>
    <div className={`mt-3 flex items-center gap-1 text-xs ${a.vetting==='verified'?'text-mint':'text-muted-foreground'}`}><ShieldCheck className="size-4"/>{a.vetting==='verified'?'Verified by expert bookers':a.vetting==='pending'?'Review pending':'Not yet reviewed'}</div>
    <p className="mt-5 text-sm leading-relaxed">{a.background||'No background yet.'}</p>
    <div className="mt-6 border-y border-border py-4 text-sm">
     <p className="flex items-center gap-2 font-bold"><CalendarDays className="size-4 text-primary"/>{s.slot_date?new Date(`${s.slot_date}T12:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}):'Date TBD'} · {s.slot_start?.slice(0,5)}</p>
     <p className="mt-2 text-muted-foreground">{a.set_length_min??'—'}-minute set · ${a.rate_usd??'—'}</p>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{s.reason}</p>
    <Button variant="acid" className="mt-6 h-14 w-full text-base" disabled={busy} onClick={confirm}><Check className="size-5"/>{busy?'Confirming…':'Confirm artist'}</Button>
    <p className="mt-3 text-center text-[11px] text-muted-foreground">Confirming opens a group chat with {a.name} and Mack to set up a Google Meet call.</p>
   </div>
  </div>
 </div></main>;
}
