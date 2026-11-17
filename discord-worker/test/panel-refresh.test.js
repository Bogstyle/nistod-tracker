import test from 'node:test';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {board,updatePanel,panelDigest} from '../src/index.js';

const ref={channel_id:'salon1',message_id:'panneau1'};
function envWithPanel({hash=null,rows=[],writeFail=false}={}){
  let storedHash=hash,writeCount=0,reads=0;
  const env={DISCORD_BOT_TOKEN:'fake-token',DB:{prepare(query){
    if(query.includes('WHERE key=\'panel\''))return {first:async()=>({value:JSON.stringify(ref)})};
    if(query.includes('WHERE key=\'panel_signature\''))return {first:async()=>storedHash===null?null:{value:storedHash}};
    if(query.includes('INSERT INTO app_settings'))return {bind(h){return {run:async()=>{
      if(writeFail)throw Error('D1 write down');storedHash=h;writeCount++;return {meta:{changes:1}};
    }}}};
    if(query.includes('FROM nm_catalog'))return {bind(){return {all:async()=>({results:rows})}}};
    throw Error('Unexpected DB '+query);
  }}};
  return {env,getStoredHash:()=>storedHash,getWrites:()=>writeCount};
}

test('Premier refresh: un seul PATCH sur le message existant et signature conservée',async()=>{
  const data=envWithPanel();const calls=[];
  const stub=mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,method:options.method,body:JSON.parse(options.body)});
    return {ok:true,status:200,json:async()=>({id:'panneau1'})};
  });
  try{
    const r=await updatePanel(data.env);
    assert.deepEqual(r,{ok:true,changed:true});
    assert.equal(calls.length,1);
    assert.equal(calls[0].method,'PATCH');
    assert.match(calls[0].url,/\/channels\/salon1\/messages\/panneau1$/);
    assert.match(calls[0].body.embeds[0].description,/Aucun ToD actif/);
    assert.equal(data.getWrites(),1);
    assert.match(data.getStoredHash(),/^[a-f0-9]{64}$/);
  }finally{stub.mock.restore();}
});

test('Cron répété: aucune nouvelle requête HTTP ni écriture D1 si contenu inchangé',async()=>{
  const payload=await board(envWithPanel().env.DB);
  const hash=await panelDigest(payload);
  const data=envWithPanel({hash});
  const stub=mock.method(globalThis,'fetch',async()=>{throw Error('Aucun PATCH nécessaire');});
  try{
    for(let i=0;i<5;i++)assert.deepEqual(await updatePanel(data.env),{ok:true,changed:false});
    assert.equal(stub.mock.calls.length,0);
    assert.equal(data.getWrites(),0);
  }finally{stub.mock.restore();}
});

test('Le timestamp varie chaque minute sans changer la signature du tableau',async()=>{
  const db=envWithPanel().env.DB;
  const a=await board(db,Date.parse('2026-11-16T13:21:00Z'));
  const b=await board(db,Date.parse('2026-11-16T13:22:00Z'));
  assert.notEqual(a.embeds[0].timestamp,b.embeds[0].timestamp);
  assert.equal(await panelDigest(a),await panelDigest(b));
});

test('L’ouverture d’une fenêtre change automatiquement la signature',async()=>{
  const row={name:'Simurgh',window_start_utc:'2026-11-17T08:00:00.000Z',window_end_utc:'2026-11-17T08:30:00.000Z',local_input:'16/11/26 11:00',source_timezone:'Europe/Paris'};
  const db=envWithPanel({rows:[row]}).env.DB;
  const a=await board(db,Date.parse('2026-11-17T07:59:00Z'));
  const b=await board(db,Date.parse('2026-11-17T08:01:00Z'));
  assert.notEqual(await panelDigest(a),await panelDigest(b));
  assert.match(b.embeds[0].fields[0].value,/Fenêtre ouverte/);
});

test('Le départ du suivi après la fin de fenêtre change la signature',async()=>{
  // La simulation reproduit le filtrage des entrées expirées côté D1.
  const rows=[{name:'Argus',window_start_utc:'2026-11-17T08:00:00Z',window_end_utc:'2026-11-17T08:30:00Z',local_input:'16/11/26 11:00',source_timezone:'Europe/Paris'}];
  const early=await board(envWithPanel({rows}).env.DB,Date.parse('2026-11-17T08:15:00Z'));
  const late=await board(envWithPanel({rows:[]}).env.DB,Date.parse('2026-11-17T08:31:00Z'));
  assert.notEqual(await panelDigest(early),await panelDigest(late));
  assert.match(late.embeds[0].description,/Aucun ToD actif/);
});

test('Forcer le refresh est possible même quand la signature est inchangée',async()=>{
  const hash=await panelDigest(await board(envWithPanel().env.DB));
  const data=envWithPanel({hash});
  const stub=mock.method(globalThis,'fetch',async()=>({ok:true,status:200,json:async()=>({id:'panneau1'})}));
  try{
    assert.deepEqual(await updatePanel(data.env,{force:true}),{ok:true,changed:true});
    assert.equal(stub.mock.calls.length,1);
  }finally{stub.mock.restore();}
});

test('Discord HTTP 403 ne sauvegarde pas la signature : le Cron pourra retenter',async()=>{
  const data=envWithPanel();
  const stub=mock.method(globalThis,'fetch',async()=>({ok:false,status:403,text:async()=> 'Forbidden'}));
  const log=mock.method(console,'error',()=>{});
  try{
    const r=await updatePanel(data.env);
    assert.equal(r.ok,false);
    assert.equal(data.getWrites(),0);
    assert.equal(data.getStoredHash(),null);
  }finally{stub.mock.restore();log.mock.restore();}
});

test('Si D1 refuse le stockage du hash après un PATCH réussi, ne prétend pas que PATCH a échoué',async()=>{
  const data=envWithPanel({writeFail:true});
  const stub=mock.method(globalThis,'fetch',async()=>({ok:true,status:200,json:async()=>({id:'panneau1'})}));
  const log=mock.method(console,'error',()=>{});
  try{
    assert.deepEqual(await updatePanel(data.env),{ok:true,changed:true});
    assert.equal(data.getStoredHash(),null);
  }finally{stub.mock.restore();log.mock.restore();}
});
