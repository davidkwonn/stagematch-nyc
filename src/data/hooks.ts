import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeLive } from './realtime';
export function useLiveData(){const qc=useQueryClient();useEffect(()=>subscribeLive(()=>{void qc.invalidateQueries();}),[qc]);}
