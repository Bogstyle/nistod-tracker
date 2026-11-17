import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {beginPair,exchangePair,revokePair,validateReport,saveAddonTod,addonApi} from '../src/addon-api.js';

const here=path.dirname(fileURLToPath(import.meta.url));
function createDb(){
  const sqlite=new DatabaseSync(':memory:');
  for(const n of [1,2,3,4,5,6])sqlite.exec(fs.readFileSync(path.join(here,'..','migrations',`000${n}_`+({1:'init',2:'dm_subscriptions',3:'reports',4:'tod_wizard_and_moderation',5:'catalog_spawn_modes',6:'addon_link'}[n])+'.sql'),'utf8'));
  const DB={prepare(sql){const stmt=sqlite.prepare(sql);return {
    bind(...args){return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};},
    first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()}),run:async()=>({meta:{changes:Number(stmt.run().changes)}})
  };}};
  return {DB,sqlite};
}
const user='123456789012345678';
function report(overrides={}){return {event_id:'11111111-2222-4333-8444-555555555555',nm_slug:'charybdis',observed_at_utc:new Date(Date.now()-15*60_000).toISOString().replace(/\.\d{3}Z$/,'Z'),event_type:'KILL_CONFIRMED',confirmed_by_user:true,source:'chat_suggestion',...overrides};}

test('pairing: single use, hash-only token, revoke',async()=>{
  const {DB,sqlite}=createDb();
  const pair=await beginPair(DB,user,'Nisroch');
  assert.match(pair.code,/^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/);
  const row=sqlite.prepare('SELECT * FROM addon_pair_codes LIMIT 1').get();
  assert.ok(!JSON.stringify(row).includes(pair.code.replaceAll('-','')));
  const linked=await exchangePair(DB,pair.code);
  assert.match(linked.token,/^[a-f0-9]{64}$/);
  assert.equal(await exchangePair(DB,pair.code),null);
  assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM addon_tokens').all()).includes(linked.token));
  await revokePair(DB,user);
  assert.ok(sqlite.prepare('SELECT revoked_at_utc FROM addon_tokens').get().revoked_at_utc);
});

test('report validation requires explicit confirmation, valid UTC, sane NM',()=>{
  assert.equal(validateReport(report()).nm_slug,'charybdis');
  for(const bad of [report({confirmed_by_user:false}),report({event_type:'SIGHTING_ALIVE'}),report({nm_slug:'; DROP TABLE'}),report({observed_at_utc:'2024-01-01T00:00:00Z'}),report({observed_at_utc:'local time'})]){
    assert.throws(()=>validateReport(bad));
  }
});

test('save addon ToD: D1 event, outbox, board, idempotence and conflict',async()=>{
  const {DB,sqlite}=createDb();
  const actor={discord_user_id:user,reporter_display_name:'Nisroch'};
  const first=await saveAddonTod(DB,actor,report());
  assert.equal(first.body.state,'accepted');
  assert.equal(sqlite.prepare('SELECT count(*) c FROM current_tods').get().c,1);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM report_log_outbox').get().c,1);
  assert.equal(sqlite.prepare('SELECT reporter_discord_id FROM tod_events').get().reporter_discord_id,user);
  const again=await saveAddonTod(DB,actor,report());
  assert.equal(again.body.duplicate,true);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM report_log_outbox').get().c,1);
  const second=await saveAddonTod(DB,actor,report({event_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}));
  assert.equal(second.body.state,'conflict');
  assert.equal(sqlite.prepare('SELECT count(*) c FROM report_log_outbox').get().c,2);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM current_tods').get().c,1);
});

test('HTTP API rejects unauthenticated reports; processes paired report',async()=>{
  const {DB,sqlite}=createDb();
  const link=await beginPair(DB,user,'Nisroch');
  const pairReq=new Request('https://example.workers.dev/api/v1/addon/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:link.code})});
  const env={DB},wait=[];const ctx={waitUntil:p=>wait.push(p)};
  const auth=await (await addonApi(pairReq,env,ctx)).json();
  assert.ok(auth.token);
  const invalidReq=new Request('https://example.workers.dev/api/v1/addon/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report())});
  assert.equal((await addonApi(invalidReq,env,ctx)).status,401);
  const submitReq=new Request('https://example.workers.dev/api/v1/addon/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+auth.token},body:JSON.stringify(report())});
  let update=0,log=0;
  const submitted=await addonApi(submitReq,env,ctx,{updatePanel:()=>{update++;},deliverReportLogs:()=>{log++;}});
  assert.equal((await submitted.json()).state,'accepted');
  await Promise.all(wait);
  assert.equal(update,1);assert.equal(log,1);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM tod_events').get().c,1);
});

test('appairage expiré refuse toute émission de clé',async()=>{
 const {DB}=createDb();
 const old=Date.now()-20*60_000;
 const p=await beginPair(DB,user,'Nisroch',old);
 assert.equal(await exchangePair(DB,p.code),null);
});

test('HTTP API refuse une clé révoquée sans ajouter de ToD',async()=>{
 const {DB,sqlite}=createDb();
 const p=await beginPair(DB,user,'Nisroch');const linked=await exchangePair(DB,p.code);
 await revokePair(DB,user);
 const req=new Request('https://example.workers.dev/api/v1/addon/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+linked.token},body:JSON.stringify(report())});
 const res=await addonApi(req,{DB},{waitUntil:()=>{}});
 assert.equal(res.status,401);
 assert.equal(sqlite.prepare('SELECT count(*) c FROM tod_events').get().c,0);
});
