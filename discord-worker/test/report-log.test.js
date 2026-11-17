import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {reporterName,reportMessage,deliverReportLogs} from '../src/report-log.js';

const row={log_id:4,event_id:9,kind:'submission',event_state:'accepted',
  reporter_display_name:'Nisroch',reporter_discord_id:'123456789012345678',nm_name:'Argus',
  occurred_at_utc:'2026-11-16T10:50:00.000Z',created_at_utc:'2026-11-16T10:53:00.000Z',
  local_input:'16/11/26 11:50',source_timezone:'Europe/Paris'};

test('Nom du déclarant prend le surnom sur le serveur Discord',()=>{
  assert.equal(reporterName({member:{nick:'Nisroch',user:{global_name:'Bogstyle',username:'test'}}}),'Nisroch');
  assert.equal(reporterName({user:{username:'Nisroch'}}),'Nisroch');
});
test('Message accepté contient déclarant, NM, heure du kill, heure du signalement, fuseau',()=>{
  const message=reportMessage(row);
  assert.match(message,/Nisroch/);
  assert.match(message,/Argus/);
  assert.match(message,/16\/11\/26 11:50 \(Europe\/Paris\)/);
  assert.match(message,/Heure de mort déclarée : <t:1794826200:F>/);
  assert.match(message,/Date du signalement : <t:1794826380:F>/);
  assert.match(message,/ToD enregistré/);
  assert.match(message,/pas nécessairement celui qui a tué/);
});
test('Signalement contradictoire identifié et pas présenté comme accepté',()=>{
  const msg=reportMessage({...row,event_state:'conflict'});
  assert.match(msg,/Signalement contradictoire/);
  assert.doesNotMatch(msg,/✅ \*\*ToD enregistré/);
});
test('Invalidation est un événement distinct, sans faux auteur de modération',()=>{
  const msg=reportMessage({...row,kind:'invalidation',event_state:'invalidated'});
  assert.match(msg,/ToD invalidé/);
  assert.match(msg,/auteur de l’invalidation n’est pas connu/);
});
test('Un pseudo malveillant ne déclenche pas de mention directe',()=>{
  const msg=reportMessage({...row,reporter_display_name:'@everyone **Admin**'});
  assert.doesNotMatch(msg,/@everyone/);
  assert.match(msg,/@\u200beveryone/);
});
test('Pas de Channel ID : les rapports restent en attente, aucun appel à Discord',async()=>{
  const f=mock.method(globalThis,'fetch',()=>{throw Error('No network wanted');});
  try{assert.equal((await deliverReportLogs({REPORTS_CHANNEL_ID:''})).skipped,true);assert.equal(f.mock.calls.length,0);}
  finally{f.mock.restore();}
});
test('Un rapport est publié une fois, sans ping, puis marqué delivered',async()=>{
  const dbChanges=[]; const posts=[];
  const env={REPORTS_CHANNEL_ID:'123456789012345679',DISCORD_BOT_TOKEN:'secret',DB:{prepare(sql){
    return {bind(...args){return {
      async all(){return {results:[row]}},
      async run(){dbChanges.push({sql,args});return {meta:{changes:1}}}
    }}};
  }}};
  const stub=mock.method(globalThis,'fetch',async(url,options)=>{
    posts.push({url,options});return {ok:true,status:200,json:async()=>({id:'message-123'})};
  });
  try{
    const res=await deliverReportLogs(env,Date.parse('2026-11-16T11:00:00Z'));
    assert.deepEqual(res,{delivered:1,failed:0});
    assert.equal(posts.length,1);
    assert.equal(posts[0].options.method,'POST');
    assert.match(posts[0].url,/\/channels\/123456789012345679\/messages$/);
    const body=JSON.parse(posts[0].options.body);
    assert.deepEqual(body.allowed_mentions,{parse:[]});
    assert.match(body.content,/Nisroch/);
    assert.equal(dbChanges.length,2);
    assert.match(dbChanges[1].sql,/delivery_state='delivered'/);
  }finally{stub.mock.restore()}
});
test('Aucune publication si la ligne de rapport est déjà revendiquée',async()=>{
  const env={REPORTS_CHANNEL_ID:'123456789012345679',DISCORD_BOT_TOKEN:'secret',DB:{prepare(){
    return {bind(){return {async all(){return {results:[row]}},async run(){return {meta:{changes:0}}}}}};
  }}};
  const stub=mock.method(globalThis,'fetch',()=>{throw Error('No POST');});
  try{assert.deepEqual(await deliverReportLogs(env),{delivered:0,failed:0});assert.equal(stub.mock.calls.length,0)}
  finally{stub.mock.restore();}
});

test('Invalidation depuis la commande admin contient modérateur et motif',()=>{
  const msg=reportMessage({...row,kind:'invalidation',event_state:'invalidated',
    invalidated_by_discord_id:'123456789012345679',invalidated_by_display_name:'Moderateur',invalidation_reason:'ToD de test'});
  assert.match(msg,/Modération.*Moderateur/);
  assert.match(msg,/Motif : ToD de test/);
});
