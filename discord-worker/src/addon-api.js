import {addMinutes} from './time.js';
import {submissionText} from './spawn.js';

const MAX_AGE_MS = 14 * 86400000;
const iso = () => new Date().toISOString();
export const secureHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
export function responseJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:secureHeaders});}
export async function sha256(text){const v=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(v)].map(n=>n.toString(16).padStart(2,'0')).join('');}
function randomHex(bytes){return [...crypto.getRandomValues(new Uint8Array(bytes))].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();}
const validCode = x=>typeof x==='string'&&/^[A-F0-9]{16}$/.test(x.replaceAll('-','').toUpperCase());
const clean=(str,length=80)=>String(str||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,length);

export async function beginPair(db,discordId,displayName,now=Date.now()){
  if(!/^\d{17,22}$/.test(String(discordId||'')))throw Error('Discord actor missing');
  const code=randomHex(8);
  const expiry=new Date(now+10*60_000).toISOString();
  await db.prepare(`INSERT INTO addon_pair_codes(code_hash,discord_user_id,reporter_display_name,expires_at_utc,created_at_utc)
    VALUES(?,?,?,?,?)`).bind(await sha256(code),discordId,clean(displayName),expiry,new Date(now).toISOString()).run();
  return {code:code.slice(0,4)+'-'+code.slice(4,8)+'-'+code.slice(8,12)+'-'+code.slice(12),expires_at_utc:expiry};
}
export async function revokePair(db,discordId){
  await db.prepare('UPDATE addon_tokens SET revoked_at_utc=? WHERE discord_user_id=? AND revoked_at_utc IS NULL').bind(iso(),discordId).run();
  await db.prepare('DELETE FROM addon_pair_codes WHERE discord_user_id=?').bind(discordId).run();
}
async function requestJson(request,maxBytes=4096){
  if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type')||''))throw Object.assign(Error('Expected application/json'),{status:415});
  if(Number(request.headers.get('content-length')||0)>maxBytes)throw Object.assign(Error('Body too large'),{status:413});
  const raw=await request.text();
  if(raw.length>maxBytes)throw Object.assign(Error('Body too large'),{status:413});
  try{return JSON.parse(raw);}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
export async function exchangePair(db,code,now=Date.now()){
  if(!validCode(code))return null;
  const normalized=code.replaceAll('-','').toUpperCase();
  const digest=await sha256(normalized);
  const used=new Date(now).toISOString();
  const claim=await db.prepare(`UPDATE addon_pair_codes SET used_at_utc=?
    WHERE code_hash=? AND used_at_utc IS NULL AND expires_at_utc>?`).bind(used,digest,used).run();
  if(!claim.meta?.changes)return null;
  const row=await db.prepare('SELECT discord_user_id,reporter_display_name FROM addon_pair_codes WHERE code_hash=?').bind(digest).first();
  if(!row)return null;
  const token=randomHex(32).toLowerCase();
  await db.prepare('INSERT INTO addon_tokens(token_hash,discord_user_id,reporter_display_name,created_at_utc) VALUES(?,?,?,?)')
    .bind(await sha256(token),row.discord_user_id,row.reporter_display_name,used).run();
  return {token,discord_user_id:row.discord_user_id};
}
function bearerToken(request){const auth=request.headers.get('authorization')||'';const found=/^Bearer ([a-f0-9]{64})$/i.exec(auth);return found?found[1].toLowerCase():null;}
export function validateReport(body,now=Date.now()){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('Invalid event'),{status:400});
  if(!/^[0-9a-f-]{36}$/i.test(body.event_id||'')||!/^\w[\w-]{0,79}$/.test(body.nm_slug||''))throw Object.assign(Error('Invalid event identity'),{status:400});
  const isSimulation=body.event_type==='SIMULATION';
  const isDeath=body.event_type==='KILL_CONFIRMED';
  if(!isSimulation&&!isDeath)throw Object.assign(Error('Unsupported event type'),{status:400});
  const death=Date.parse(body.observed_at_utc||'');
  if(!Number.isFinite(death)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(body.observed_at_utc||''))throw Object.assign(Error('Invalid UTC timestamp'),{status:400});
  if(death>now+5*60_000||death<now-MAX_AGE_MS)throw Object.assign(Error('Timestamp outside allowed period'),{status:400});
  if(isSimulation){
    if(body.source!=='simulation'||body.confirmed_by_user!==false)throw Object.assign(Error('Invalid simulation identity'),{status:400});
  }else if(body.source==='packet_death'){
    // The client supplies evidence metadata; the server cannot itself verify game packets.
    if(body.confirmed_by_user!==false || body.evidence_kind!=='packet_0x029_death'
       || ![6,20].includes(body.death_message_id)
       || !Number.isInteger(body.target_id)||body.target_id<1||body.target_id>0xFFFFFFFF)
       throw Object.assign(Error('Invalid packet death evidence'),{status:400});
  }else if(body.confirmed_by_user!==true||!['manual','chat_suggestion'].includes(body.source||'manual')){
    throw Object.assign(Error('Human confirmation required'),{status:400});
  }
  return {event_id:body.event_id.toLowerCase(),nm_slug:body.nm_slug,
    event_type:body.event_type,observed_at_utc:new Date(death).toISOString(),
    source:body.source||'manual'};
}
export async function saveAddonSimulation(db,actor,body,now=Date.now()){
  const entry=validateReport(body,now);
  if(entry.event_type!=='SIMULATION')throw Object.assign(Error('Invalid simulation type'),{status:400});
  const nm=await db.prepare('SELECT slug FROM nm_catalog WHERE enabled=1 AND slug=?').bind(entry.nm_slug).first();
  if(!nm)return {status:404,body:{ok:false,error:'NM absent du catalogue'}};
  const result=await db.prepare('INSERT OR IGNORE INTO addon_simulations(event_id,discord_user_id,nm_slug,received_at_utc) VALUES(?,?,?,?)')
    .bind(entry.event_id,actor.discord_user_id,nm.slug,new Date(now).toISOString()).run();
  return {status:200,body:{ok:true,state:'simulation',duplicate:!result.meta?.changes,
    event_id:entry.event_id,description:'SIMULATION recue ; aucun ToD, aucune alerte et aucune mise a jour publique'}};
}
export async function saveAddonTod(db,actor,body,now=Date.now()){
  const entry=validateReport(body,now);
  if(entry.event_type!=='KILL_CONFIRMED')throw Object.assign(Error('Only death events can create ToDs'),{status:400});
  const nm=await db.prepare('SELECT * FROM nm_catalog WHERE enabled=1 AND slug=?').bind(entry.nm_slug).first();
  if(!nm)return {status:404,body:{ok:false,error:'NM absent du catalogue'}};
  const id=`addon:${entry.event_id}`;
  const preexisting=await db.prepare('SELECT id,state FROM tod_events WHERE discord_interaction_id=?').bind(id).first();
  if(preexisting)return {status:200,body:{ok:true,duplicate:true,state:preexisting.state,event_id:preexisting.id}};
  const current=await db.prepare('SELECT occurred_at_utc FROM current_tods WHERE nm_slug=?').bind(nm.slug).first();
  const conflicts=!!(current&&Date.parse(entry.observed_at_utc)<Date.parse(current.occurred_at_utc)+nm.respawn_min_minutes*60_000);
  const state=conflicts?'conflict':'accepted';
  const formatted=entry.observed_at_utc.replace('T',' ').replace(/\.000Z$/,'Z');
  const created=new Date(now).toISOString();
  const result=await db.prepare(`INSERT OR IGNORE INTO tod_events
    (discord_interaction_id,nm_slug,event_type,occurred_at_utc,source_timezone,local_input,reporter_discord_id,reporter_display_name,created_at_utc,state)
    VALUES(?,?,'KILL_CONFIRMED',?,'UTC',?,?,?,?,?)`)
    .bind(id,nm.slug,entry.observed_at_utc,formatted,actor.discord_user_id,actor.reporter_display_name,created,state).run();
  const saved=await db.prepare('SELECT id,state FROM tod_events WHERE discord_interaction_id=?').bind(id).first();
  if(!result.meta?.changes)return {status:200,body:{ok:true,duplicate:true,state:saved?.state,event_id:saved?.id}};
  if(state==='accepted'){
    await db.prepare(`INSERT INTO current_tods(nm_slug,event_id,occurred_at_utc,window_start_utc,window_end_utc,updated_at_utc)
      VALUES(?,?,?,?,?,?) ON CONFLICT(nm_slug) DO UPDATE SET event_id=excluded.event_id,
      occurred_at_utc=excluded.occurred_at_utc,window_start_utc=excluded.window_start_utc,
      window_end_utc=excluded.window_end_utc,updated_at_utc=excluded.updated_at_utc`)
      .bind(nm.slug,saved.id,entry.observed_at_utc,addMinutes(entry.observed_at_utc,nm.respawn_min_minutes),addMinutes(entry.observed_at_utc,nm.respawn_max_minutes),created).run();
  }
  return {status:200,body:{ok:true,duplicate:false,state,event_id:saved.id,description:state==='accepted'?submissionText(nm,entry.observed_at_utc):'Signalement contradictoire conservé dans le journal sans modifier le tableau'}};
}
export async function addonApi(request,env,ctx,sideEffects={}){
  const path=new URL(request.url).pathname;
  if(!['/api/v1/addon/pair','/api/v1/addon/events'].includes(path)||request.method!=='POST')return responseJson({ok:false,error:'Not found'},404);
  try{
    const payload=await requestJson(request);
    if(path.endsWith('/pair')){
      const exchanged=await exchangePair(env.DB,payload?.code);
      return exchanged?responseJson({ok:true,...exchanged}):responseJson({ok:false,error:'Code expiré, inconnu ou déjà utilisé'},403);
    }
    const token=bearerToken(request);
    if(!token)return responseJson({ok:false,error:'Non authentifié'},401);
    const actor=await env.DB.prepare('SELECT discord_user_id,reporter_display_name FROM addon_tokens WHERE token_hash=? AND revoked_at_utc IS NULL').bind(await sha256(token)).first();
    if(!actor)return responseJson({ok:false,error:'Appairage révoqué ou absent'},401);
    const outcome=payload?.event_type==='SIMULATION'
      ?await saveAddonSimulation(env.DB,actor,payload)
      :await saveAddonTod(env.DB,actor,payload);
    if(outcome.body.ok&&!outcome.body.duplicate&&outcome.body.state!=='simulation'){
      ctx.waitUntil(Promise.allSettled([sideEffects.updatePanel?.(),sideEffects.deliverReportLogs?.()]));
    }
    if(outcome.body.ok){
      ctx.waitUntil(env.DB.prepare('UPDATE addon_tokens SET last_used_at_utc=? WHERE token_hash=?').bind(iso(),await sha256(token)).run());
    }
    return responseJson(outcome.body,outcome.status);
  }catch(e){const status=Number(e.status)||500;console.error('NisToD addon API:',status,String(e).slice(0,180));return responseJson({ok:false,error:status<500?String(e.message):'Erreur interne'},status);}
}
