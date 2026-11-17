import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {board, panelDigest, todNmPicker, handleInteraction} from '../src/index.js';
import {PICKER_NMS} from '../src/catalog-picker.js';
import {activeText,submissionText,trackedWhere,isPersistentSpawn} from '../src/spawn.js';
import {reminderText} from '../src/subscriptions.js';

const tod='2026-11-16T00:00:00Z';
const at=(mode,name,start,end)=>({name,spawn_mode:mode,window_start_utc:start,window_end_utc:end,
  local_input:'16/11/26 01:00',source_timezone:'Europe/Paris'});
const from=(hours)=>new Date(Date.parse(tod)+hours*3600000).toISOString();

function fakeDb(rows) {return {prepare(sql){
  assert.match(sql,/n\.spawn_mode IN \('fixed','lottery'\)/);
  return {bind(){return {all:async()=>({results:rows})}}};
}};}

test('37 NM dans le catalogue embarqué correspondent exactement aux insertions 0001/0004/0005',()=>{
  const migrations=['0001_init.sql','0004_tod_wizard_and_moderation.sql','0005_catalog_spawn_modes.sql'];
  const text=migrations.map(n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8')).join('\n');
  const names=new Set([...text.matchAll(/\('([a-z0-9-]+)','[^']*'/g)].map(x=>x[1]));
  assert.equal(PICKER_NMS.length,37);
  assert.equal(new Set(PICKER_NMS.map(x=>x.slug)).size,37);
  for(const item of PICKER_NMS)assert.ok(names.has(item.slug),'Absent de D1: '+item.slug);
  for(const slug of ['carmine-dobsonfly','yilbegan'])assert.ok(!PICKER_NMS.some(x=>x.slug===slug));
});

test('Ajout depuis Discord : pagination 37 NM, deux pages et IDs uniques',()=>{
  const first=todNmPicker();
  assert.equal(first.data.components[0].components[0].options.length,25);
  assert.match(first.data.content,/37 résultats, page 1\/2/);
  const next=todNmPicker(1);
  assert.equal(next.data.components[0].components[0].options.length,12);
  assert.match(next.data.content,/37 résultats, page 2\/2/);
  assert.equal(next.data.components[0].components[0].options.some(x=>x.label==='Charybdis'),true);
});

test('Les fenêtres bornées restent bornées et les fixed/lottery persistent',()=>{
  assert.match(trackedWhere(),/t.window_end_utc>\?/);
  assert.equal(isPersistentSpawn('window'),false);
  assert.equal(isPersistentSpawn('placeholder'),false);
  assert.equal(isPersistentSpawn('fixed'),true);
  assert.equal(isPersistentSpawn('lottery'),true);
});

test('Fixe 6 h : reste affiché même après son heure théorique',async()=>{
  const row=at('fixed','Sozu Bliberry',from(6),from(6));
  const before=await board(fakeDb([row]),Date.parse(from(5)));
  const after=await board(fakeDb([row]),Date.parse(from(7)));
  assert.equal(before.embeds[0].fields.length,1);
  assert.match(after.embeds[0].fields[0].value,/Heure théorique atteinte/);
  assert.notEqual(await panelDigest(before),await panelDigest(after));
  assert.match(submissionText({spawn_mode:'fixed',respawn_min_minutes:360,respawn_max_minutes:360},tod),/Retour théorique/);
});

test('Lottery 8-12 h : cooldown et aucune apparition garantie, persistante même à H+30',async()=>{
  const row=at('lottery','Charybdis',from(8),from(12));
  for(const [hour,re] of [[6,/Cooldown minimal/],[9,/retour possible/],[30,/Cooldown maximal/]]){
    const panel=await board(fakeDb([row]),Date.parse(from(hour)));
    assert.equal(panel.embeds[0].fields.length,1);
    assert.match(panel.embeds[0].fields[0].value,re);
    assert.match(panel.embeds[0].fields[0].value,/Aucune apparition garantie/);
  }
  assert.match(submissionText({spawn_mode:'lottery',respawn_min_minutes:480,respawn_max_minutes:720},tod),/lottery des PH/);
});

test('Placeholder beau statut : ne prédit pas le roi',()=>{
  const state=activeText(at('placeholder','Orcish Overlord',from(8),from(9)),Date.parse(from(8.5)));
  assert.match(state.detail,/pas la fenêtre du roi/);
  assert.match(submissionText({spawn_mode:'placeholder',respawn_min_minutes:480,respawn_max_minutes:540},tod),/pas celle du roi/);
});

test('Les MP de lottery préviennent sans annoncer de pop garanti',()=>{
  const result=reminderText('Charybdis',from(8),from(12),30,'lottery');
  assert.match(result,/apparition non garantie/);
  assert.doesNotMatch(result,/La fenêtre s'ouvre/);
  assert.doesNotMatch(result,/Fin de la fenêtre/);
});

test('Le formulaire modal marche sans D1 même pour les NM ajoutés',async()=>{
  const response=await handleInteraction({type:3,guild_id:'123',data:{custom_id:'nistod:tod:nm',values:['charybdis|Charybdis']},member:{user:{id:'456'}}},
    {DISCORD_GUILD_ID:'123',DB:{prepare(){throw Error('D1 interdit avant ouverture')}}},{waitUntil(){throw Error('no waitUntil')}});
  assert.equal(response.type,9);
  assert.match(response.data.title,/Charybdis/);
});
