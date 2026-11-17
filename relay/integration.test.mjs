import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRelayServer} from './index.mjs';
import {beginPair,exchangePair,addonApi} from '../discord-worker/src/addon-api.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const names=['init','dm_subscriptions','reports','tod_wizard_and_moderation','catalog_spawn_modes','addon_link','addon_simulations'];
function createDb(){
  const sqlite=new DatabaseSync(':memory:');
  names.forEach((name,i)=>sqlite.exec(fs.readFileSync(path.join(here,'../discord-worker/migrations',`000${i+1}_${name}.sql`),'utf8')));
  const DB={prepare(sql){const st=sqlite.prepare(sql);return {bind(...args){return {
    first:async()=>st.get(...args)||null,all:async()=>({results:st.all(...args)}),run:async()=>({meta:{changes:Number(st.run(...args).changes)}})}},
    first:async()=>st.get()||null,all:async()=>({results:st.all()}),run:async()=>({meta:{changes:Number(st.run().changes)}})};}};
  return{DB,sqlite};
}

test('chaîne complète simulation vs mort : addon relay -> API Cloudflare -> SQLite',async t=>{
  const {DB,sqlite}=createDb();t.after(()=>sqlite.close());
  const owner='123456789012345678';
  const code=await beginPair(DB,owner,'Nisroch');
  const auth=await exchangePair(DB,code.code);
  let panel=0,logs=0;
  const waits=[];const ctx={waitUntil:p=>waits.push(p)};
  const state={worker:'https://example.workers.dev',local_key:'test-key',token:auth.token,queue:[]};
  const relay=createRelayServer(state,()=>{},async(url,opts)=>addonApi(new Request(url,opts),{DB},ctx,{
    updatePanel:()=>{panel++},deliverReportLogs:()=>{logs++}}));
  await new Promise(resolve=>relay.server.listen(0,'127.0.0.1',resolve));t.after(()=>relay.server.close());
  const address='http://127.0.0.1:'+relay.server.address().port;
  const headers={'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key};
  const date=new Date(Date.now()-10000).toISOString().replace(/\.\d{3}Z$/,'Z');
  const submit=async body=>{
    const r=await fetch(address+'/submit',{method:'POST',headers,body:new URLSearchParams(body)});
    assert.equal(r.status,202);
    for(let i=0;i<100 && state.queue.at(-1)?.state==='queued';i++){
      await new Promise(resolve=>setTimeout(resolve,12));
    }
    assert.equal(state.queue.at(-1).state,'delivered');
    await Promise.all(waits.splice(0));
    return r;
  };
  await submit({nm_slug:'behemoth',source:'simulation',confirmed:'no',observed_at_utc:date,client_request_id:'scenario_simul_123456'});
  assert.equal(state.queue[0].remote_state,'simulation');
  assert.equal(sqlite.prepare('SELECT count(*) c FROM addon_simulations').get().c,1);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM tod_events').get().c,0);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM current_tods').get().c,0);
  assert.equal(panel,0);assert.equal(logs,0);
  await submit({nm_slug:'behemoth',source:'packet_death',confirmed:'no',observed_at_utc:date,
    death_message_id:'6',target_id:'12345678',client_request_id:'scenario_packet_123456'});
  assert.equal(state.queue[1].remote_state,'accepted');
  assert.equal(sqlite.prepare('SELECT count(*) c FROM tod_events').get().c,1);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM current_tods').get().c,1);
  assert.equal(panel,1);assert.equal(logs,1);
  assert.equal(sqlite.prepare('SELECT count(*) c FROM addon_simulations').get().c,1);
});
