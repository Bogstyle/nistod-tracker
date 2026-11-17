import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {handleInteraction} from '../src/index.js';
import {PICKER_NMS} from '../src/catalog-picker.js';

const member={user:{id:'222222222222222222',username:'Nisroch'}};
const base={type:3,application_id:'1111111111111111112',guild_id:'1111111111111111111',
  token:'test-interaction-token',member};

function toxicEnv(){
  return {DISCORD_GUILD_ID:base.guild_id,DB:{prepare(){throw new Error('D1 BLOQUÉE: pas de requête autorisée avant le premier écran')}}};
}

test('Ajouter un ToD: réponse privée immédiate avec menu, zéro D1, zéro webhook différé',async()=>{
  const fetchStub=mock.method(globalThis,'fetch',async()=>{throw Error('Le bouton ne doit JAMAIS appeler Discord par fetch');});
  try{
    const response=await handleInteraction({...base,data:{custom_id:'nistod:add'}},toxicEnv(),{
      waitUntil(){throw Error('Pas de réponse différée')}});
    assert.equal(response.type,4);
    assert.equal(response.data.flags,64);
    assert.match(response.data.content,/Choisis un NM/);
    assert.equal(response.data.components.length,2);
    assert.equal(response.data.components[0].components[0].type,3);
    assert.equal(response.data.components[0].components[0].options.length,25);
    assert.ok(response.data.components[0].components[0].options.some(o=>o.value==='simurgh|Simurgh'));
    assert.equal(fetchStub.mock.calls.length,0);
  }finally{fetchStub.mock.restore();}
});

test('Pagination initiale et recherche restent synchrones et sans D1',async()=>{
  const page=await handleInteraction({...base,data:{custom_id:'nistod:tod:page:0:'}},toxicEnv(),{waitUntil(){throw Error('pas de waitUntil')}});
  assert.equal(page.type,4);assert.equal(page.data.components[0].components[0].options.length,25);
  const search=await handleInteraction({...base,type:5,data:{custom_id:'nistod:tod:search-submit',components:[
    {type:18,label:'Chercher',component:{type:4,custom_id:'prefix',value:'simu'}}]}},toxicEnv(),{waitUntil(){throw Error('pas de waitUntil')}});
  assert.equal(search.type,4);
  assert.equal(search.data.components[0].components[0].options.length,1);
  assert.equal(search.data.components[0].components[0].options[0].value,'simurgh|Simurgh');
});

test('Sélection NM: formulaire natif, aucune requête D1 et aucun message différé',async()=>{
  const response=await handleInteraction({...base,data:{custom_id:'nistod:tod:nm',values:['simurgh|Faux nom envoyé par le client']}},toxicEnv(),{
    waitUntil(){throw Error('pas de waitUntil')}});
  assert.equal(response.type,9);
  assert.equal(response.data.title,'ToD — Simurgh');
  assert.deepEqual(response.data.components.map(r=>r.component.type),[3,3,3,3]);
  assert.deepEqual(response.data.components.map(r=>r.component.options.length),[17,24,6,10]);
  assert.match(response.data.components[0].description,/Fuseau personnel/);
});

test('Un slug NM non approuvé ne permet pas d’ouvrir un formulaire frauduleux',async()=>{
  const response=await handleInteraction({...base,data:{custom_id:'nistod:tod:nm',values:['faux-nm|Wyrm']}},toxicEnv(),{waitUntil(){}});
  assert.equal(response.type,4);
  assert.match(response.data.content,/indisponible/);
});

test('Catalogue embarqué couvre les 37 NM activés (19 anciens + 18 nouveaux)',()=>{
  assert.equal(PICKER_NMS.length,37);
  assert.equal(new Set(PICKER_NMS.map(x=>x.slug)).size,37);
  assert.ok(PICKER_NMS.some(x=>x.slug==='diamond-quadav'));
  assert.ok(PICKER_NMS.some(x=>x.slug==='charybdis'));
  assert.ok(!PICKER_NMS.some(x=>x.slug==='carmine-dobsonfly'||x.slug==='yilbegan'));
});
