import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInteraction,todNmPicker} from '../src/index.js';
import {assertUniqueComponentIds} from '../src/discord.js';

const env={DISCORD_GUILD_ID:'1111111111111111111',DB:{prepare(){throw Error('D1 must not be used')}}};
const interaction={type:3,guild_id:env.DISCORD_GUILD_ID,member:{user:{id:'test-user'}},data:{custom_id:'nistod:add'}};

test('Discord: bouton ToD répond avec un custom_id unique par composant',async()=>{
  const response=await handleInteraction(interaction,env,{waitUntil(){throw Error('No waitUntil')}});
  assert.equal(response.type,4);
  assert.equal(assertUniqueComponentIds(response),true);
  const ids=response.data.components.flatMap(row=>row.components.map(c=>c.custom_id));
  assert.equal(new Set(ids).size,ids.length);
});

test('Discord: détecte le doublon historique de la v0.1.9 (même sur boutons désactivés)',()=>{
  const response={type:4,data:{components:[{type:1,components:[
    {type:2,custom_id:'page:0',disabled:true},
    {type:2,custom_id:'page:0',disabled:true}
  ]}]}};
  assert.throws(()=>assertUniqueComponentIds(response),/dupliqué/);
});

test('Discord: IDs uniques dans la pagination multi-pages (50 NM de test)',async()=>{
  const many=Array.from({length:56},(_,i)=>({slug:`nm-${i}`,name:`NM ${String(i).padStart(2,'0')}`,zone:'Test'}));
  for(const page of [0,1,2]){
    const response=todNmPicker(page,'',many);
    assert.equal(assertUniqueComponentIds(response),true);
    assert.equal(response.data.components[0].components[0].options.length,page===2?6:25);
    const ids=response.data.components.flatMap(row=>row.components.map(c=>c.custom_id));
    assert.equal(new Set(ids).size,ids.length);
  }
});

test('Discord: le filtre conserve l’unicité et la réinitialisation fonctionne',async()=>{
  const many=Array.from({length:27},(_,i)=>({slug:`nm-${i}`,name:`NM ${i}`}));
  const msg=todNmPicker(1,'nm',many);
  assertUniqueComponentIds(msg);
  const resetId=msg.data.components.at(-1).components.at(-1).custom_id;
  const reset=await handleInteraction({...interaction,data:{custom_id:resetId}},env,{waitUntil(){}});
  assertUniqueComponentIds(reset);
  assert.equal(reset.data.components[0].components[0].options.length,25);
});

test('Discord: refuse un custom_id trop long ou vide',()=>{
  for(const bad of ['', 'a'.repeat(101)]){
    assert.throws(()=>assertUniqueComponentIds({type:4,data:{components:[{type:1,components:[{type:2,custom_id:bad}]}]}}),/hors limites/);
  }
});
