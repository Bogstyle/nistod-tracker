import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelayServer} from './index.mjs';
const old=new Date(Date.now()-10000).toISOString().replace(/\.\d{3}Z$/,'Z');
function makeState(){return {worker:'https://example.workers.dev',local_key:'k'.repeat(64),token:'f'.repeat(64),queue:[]};}
async function withServer(t,fetchMock){const state=makeState();let saves=0;const r=createRelayServer(state,()=>{saves++;},fetchMock);await new Promise(resolve=>r.server.listen(0,'127.0.0.1',resolve));t.after(()=>r.server.close());return{state,port:r.server.address().port,r,saves:()=>saves};}
const params=()=>new URLSearchParams({confirmed:'yes',nm_slug:'behemoth',observed_at_utc:old,source:'manual',client_request_id:'client_key_123456789'});
test('relay only accepts keyed local confirmed forms',async t=>{
  const {port,state}=await withServer(t,async()=>new Response('{}',{status:500}));
  const base='http://127.0.0.1:'+port;
  let r=await fetch(base+'/submit',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params()});assert.equal(r.status,403);
  r=await fetch(base+'/submit',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key,origin:'https://evil.example'},body:params()});assert.equal(r.status,403);
  const bad=params();bad.set('confirmed','no');
  r=await fetch(base+'/submit',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key},body:bad});assert.equal(r.status,400);
});
test('relay queues and deduplicates; same uuid on remote retries',async t=>{
  const received=[];
  const {port,state,r}=await withServer(t,async(url,opts)=>{received.push(JSON.parse(opts.body));return new Response(JSON.stringify({ok:true,state:'accepted',event_id:21}),{status:200,headers:{'content-type':'application/json'}});});
  const base='http://127.0.0.1:'+port;
  const headers={'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key};
  let x=await fetch(base+'/submit',{method:'POST',headers,body:params()});assert.equal(x.status,202);
  x=await fetch(base+'/submit',{method:'POST',headers,body:params()});assert.equal(x.status,202);
  await r.flush();
  assert.equal(received.length,1);assert.equal(state.queue.length,1);
  assert.match(received[0].event_id,/^[0-9a-f-]{36}$/);
  const status=await (await fetch(base+'/status?id=client_key_123456789',{headers:{'x-nistod-local-key':state.local_key}})).json();
  assert.equal(status.state,'delivered');
});

test('relay conserve la même identité d’événement après erreur HTTP',async t=>{
 const received=[];let attempts=0;
 const {port,state,r}=await withServer(t,async(url,opts)=>{
   received.push(JSON.parse(opts.body));attempts++;
   return attempts===1?new Response('{}',{status:503,headers:{'content-type':'application/json'}}):new Response(JSON.stringify({ok:true,state:'accepted'}),{status:200,headers:{'content-type':'application/json'}});
 });
 const headers={'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key};
 const resp=await fetch('http://127.0.0.1:'+port+'/submit',{method:'POST',headers,body:params()});assert.equal(resp.status,202);
 await r.flush();assert.equal(state.queue[0].state,'queued');
 state.queue[0].next_attempt_at=Date.now()-1;
 await r.flush();assert.equal(state.queue[0].state,'delivered');
 assert.equal(received.length,2);assert.equal(received[0].event_id,received[1].event_id);
});

test('relancer un refus permanent exige une action manuelle et conserve event_id',async t=>{
 let attempt=0;const seen=[];
 const {port,state,r}=await withServer(t,async(url,opts)=>{
   seen.push(JSON.parse(opts.body));attempt++;
   if(attempt===1)return new Response(JSON.stringify({ok:false,error:'Accès provisoirement refusé'}),{status:401,headers:{'content-type':'application/json'}});
   return new Response(JSON.stringify({ok:true,state:'accepted'}),{status:200,headers:{'content-type':'application/json'}});
 });
 const root='http://127.0.0.1:'+port;const headers={'content-type':'application/x-www-form-urlencoded','x-nistod-local-key':state.local_key};
 const first=await fetch(root+'/submit',{method:'POST',headers,body:params()});assert.equal(first.status,202);
 await r.flush();assert.equal(state.queue[0].state,'failed');
 const rep=await fetch(root+'/retry',{method:'POST',headers,body:new URLSearchParams({id:state.queue[0].client_request_id})});assert.equal(rep.status,202);
 await r.flush();assert.equal(state.queue[0].state,'delivered');
 assert.equal(seen.length,2);assert.equal(seen[0].event_id,seen[1].event_id);
});
