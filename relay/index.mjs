#!/usr/bin/env node
// NisToD v0.3.0 local companion: loopback-only HTTP -> HTTPS Worker.
// No gameplay integration. Node.js 20+; no third-party modules.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const base=path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH=path.join(base,'.nistod-state.json');
const PORT=38461;
const MAX_QUEUE=200;
let timer=null;
const utc=()=>new Date().toISOString();
function atomicSave(state){
  const temp=STATE_PATH+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});
  fs.renameSync(temp,STATE_PATH);
}
function load(){try{return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));}catch{return null;}}
function safeUrl(raw){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('URL HTTPS du Worker requise');
  if(url.pathname!=='/'&&url.pathname!=='')throw Error('Utilise la racine HTTPS du Worker, sans chemin');
  return url.origin;
}
function luaEscape(s){return String(s).replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\r','').replaceAll('\n','');}
function configure(workerUrl,addonDir){
  const worker=safeUrl(workerUrl);
  if(!fs.existsSync(path.join(addonDir,'nistod.lua')))throw Error('Dossier addon invalide (nistod.lua absent)');
  const old=load();
  const state={version:1,worker,local_key:old?.local_key||crypto.randomBytes(32).toString('hex'),token:old?.worker===worker?old?.token||null:null,queue:old?.worker===worker?old?.queue||[]:[]};
  atomicSave(state);
  fs.writeFileSync(path.join(addonDir,'nistod_local.lua'),`-- Généré par node relay/index.mjs setup. Secret local : ne pas publier.\nreturn { port = ${PORT}, local_key = '${luaEscape(state.local_key)}' };\n`,{mode:0o600});
  console.log('Relais configuré. Fichier nistod_local.lua écrit dans',addonDir);
  console.log('Étape suivante : /nistod-lier dans Discord puis node index.mjs pair CODE');
}
async function pair(code){
  const state=load();if(!state)throw Error('Configurer le relais avant l’appairage.');
  const res=await fetch(state.worker+'/api/v1/addon/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code}),signal:AbortSignal.timeout(8000)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.ok||!/^([a-f0-9]{64})$/.test(body.token||''))throw Error(body.error||'Appairage impossible');
  state.token=body.token;
  atomicSave(state);
  console.log('✅ Relais lié à Discord. La clé est enregistrée localement, non affichée.');
}
function writeJson(res,status,obj){
  const b=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-length':Buffer.byteLength(b)});res.end(b);
}
function parseBody(req){return new Promise((resolve,reject)=>{
  let body='';let total=0;req.setEncoding('utf8');
  req.on('data',chunk=>{total+=Buffer.byteLength(chunk);if(total>4096){reject(Error('Corps trop grand'));req.destroy();}else body+=chunk;});
  req.on('end',()=>resolve(body));req.on('error',reject);
});}
function validSubmission(body){
  if(!/^\w[\w-]{0,79}$/.test(body.nm_slug||''))return false;
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(body.observed_at_utc||''))return false;
  const date=Date.parse(body.observed_at_utc);
  if(!Number.isFinite(date)||date>Date.now()+300000||date<Date.now()-14*86400000)return false;
  if(!/^[a-zA-Z0-9_-]{12,80}$/.test(body.client_request_id||''))return false;
  if(body.source==='simulation')return body.confirmed==='no';
  if(body.source==='packet_death')return body.confirmed==='no'
    &&(body.death_message_id==='6'||body.death_message_id==='20')
    &&/^\d{1,10}$/.test(body.target_id||'')
    &&Number(body.target_id)>0&&Number(body.target_id)<=0xFFFFFFFF;
  return (body.source==='manual'||body.source==='chat_suggestion')&&body.confirmed==='yes';
}
export function createRelayServer(state,saveState=atomicSave,remoteFetch=fetch){
  const deliveries=new Map();
  let sending=false;
  async function flush(){
    if(sending||!state.token)return;
    sending=true;
    try{
      for(const item of state.queue){
        if(item.state!=='queued'||item.next_attempt_at>Date.now())continue;
        try{
          const req=await remoteFetch(state.worker+'/api/v1/addon/events',{
            method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+state.token},
            body:JSON.stringify({event_id:item.event_id,nm_slug:item.nm_slug,event_type:item.source==='simulation'?'SIMULATION':'KILL_CONFIRMED',
              confirmed_by_user:item.source!=='simulation'&&item.source!=='packet_death',
              evidence_kind:item.source==='packet_death'?'packet_0x029_death':undefined,
              death_message_id:item.source==='packet_death'?item.death_message_id:undefined,
              target_id:item.source==='packet_death'?item.target_id:undefined,
              observed_at_utc:item.observed_at_utc,source:item.source}),
            signal:AbortSignal.timeout(8000)
          });
          const data=await req.json().catch(()=>({}));
          if(req.ok&&data.ok){
            item.state='delivered';item.remote_state=data.state;
            item.message=data.state==='simulation'?'Simulation acceptee (aucun ToD public)':
              data.state==='conflict'?'Signalement contradictoire journalise':'ToD accepte';
            item.event_id_server=data.event_id;
          }
          else if(req.status===401||req.status===403||req.status===400||req.status===404){item.state='failed';item.message='Refus du Worker : '+String(data.error||req.status).slice(0,100);}
          else throw Error('Worker HTTP '+req.status);
        }catch(e){item.attempts++;item.message=String(e.message||e).slice(0,110);item.next_attempt_at=Date.now()+Math.min(300000,5000*(2**Math.min(5,item.attempts)));}
        saveState(state);deliveries.set(item.client_request_id,item);
      }
    }finally{sending=false;}
  }
  const server=http.createServer(async(req,res)=>{
    if(req.headers.origin){writeJson(res,403,{ok:false,error:'Requêtes navigateur interdites'});return;}
    if(req.headers['x-nistod-local-key']!==state.local_key){writeJson(res,403,{ok:false,error:'Client local non autorisé'});return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='GET'&&url.pathname==='/status'){
      const id=url.searchParams.get('id');const item=state.queue.find(x=>x.client_request_id===id);
      writeJson(res,item?200:404,item?{ok:true,state:item.state,message:item.message||'',remote_state:item.remote_state||null,event_id:item.event_id_server||null}:{ok:false,error:'Envoi inconnu'});return;
    }
    if(req.method==='POST'&&url.pathname==='/retry'){
      if(!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type']||'')){writeJson(res,415,{ok:false,error:'Content-Type invalide'});return;}
      try{
        const body=Object.fromEntries(new URLSearchParams(await parseBody(req)));
        const item=state.queue.find(x=>x.client_request_id===body.id);
        if(!item||item.state!=='failed'){writeJson(res,409,{ok:false,error:'Aucun envoi en échec réessayable'});return;}
        if(!state.token){writeJson(res,409,{ok:false,error:'Relais non appairé'});return;}
        item.state='queued';item.message='Nouvelle tentative demandée';item.attempts=0;item.next_attempt_at=Date.now();
        saveState(state);writeJson(res,202,{ok:true,state:item.state,id:item.client_request_id});
        void flush().catch(e=>console.error('Réessai :',String(e.message||e)));
      }catch{if(!res.headersSent)writeJson(res,400,{ok:false,error:'Corps de requête invalide'});}return;
    }
    if(req.method==='POST'&&url.pathname==='/submit'){
      if(!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type']||'')){writeJson(res,415,{ok:false,error:'Content-Type invalide'});return;}
      try{
        const body=Object.fromEntries(new URLSearchParams(await parseBody(req)));
        if(!validSubmission(body)){writeJson(res,400,{ok:false,error:'Données ou confirmation invalides'});return;}
        const previous=state.queue.find(x=>x.client_request_id===body.client_request_id);
        if(previous){writeJson(res,202,{ok:true,state:previous.state,id:previous.client_request_id});return;}
        if(!state.token){writeJson(res,409,{ok:false,error:'Relais non appairé : /nistod-lier puis pair'});return;}
        if(state.queue.filter(x=>x.state==='queued').length>=MAX_QUEUE){writeJson(res,429,{ok:false,error:'File d’attente pleine'});return;}
        const item={client_request_id:body.client_request_id,event_id:crypto.randomUUID(),nm_slug:body.nm_slug,observed_at_utc:body.observed_at_utc,source:body.source,
          death_message_id:body.source==='packet_death'?Number(body.death_message_id):null,
          target_id:body.source==='packet_death'?Number(body.target_id):null,state:'queued',attempts:0,next_attempt_at:Date.now(),message:'En attente de transmission',created_at:utc()};
        state.queue.push(item);
        // Prune delivered items only, never silently lose pending submissions.
        if(state.queue.length>1000)state.queue=state.queue.filter(x=>x.state==='queued'||x.state==='failed').concat(state.queue.filter(x=>x.state==='delivered').slice(-100));
        saveState(state);writeJson(res,202,{ok:true,state:'queued',id:item.client_request_id});
        void flush().catch(e=>console.error('Relais envoi :',String(e.message||e)));
      }catch(e){if(!res.headersSent)writeJson(res,400,{ok:false,error:'Corps de requête invalide'});}return;
    }
    writeJson(res,404,{ok:false,error:'Route inconnue'});
  });
  return {server,flush};
}
function start(){
  const state=load();if(!state)throw Error('D’abord : node index.mjs setup URL_DU_WORKER DOSSIER_ADDON');
  const relay=createRelayServer(state);
  relay.server.listen(PORT,'127.0.0.1',()=>console.log(`NisToD relais local actif sur 127.0.0.1:${PORT} (${state.token?'lié':'non lié'}). Ctrl+C pour arrêter.`));
  timer=setInterval(()=>void relay.flush().catch(e=>console.error('Réessai :',String(e.message||e))),5000);
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const [cmd,...args]=process.argv.slice(2);
  try{
    if(cmd==='setup'&&args.length===2)configure(args[0],path.resolve(args[1]));
    else if(cmd==='pair'&&args.length===1)await pair(args[0]);
    else if(cmd==='start')start();
    else {console.log('Usage :\n  node index.mjs setup https://NOM.workers.dev "C:\\VanaCore\\addons\\nistod"\n  node index.mjs pair XXXX-XXXX-XXXX-XXXX\n  node index.mjs start');process.exitCode=1;}
  }catch(e){console.error('❌ '+String(e.message||e));process.exitCode=1;}
}
