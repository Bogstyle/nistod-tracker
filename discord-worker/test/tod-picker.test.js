import test from 'node:test';
import assert from 'node:assert/strict';
import {board} from '../src/index.js';
import {localDayOptions,flexibleDayOptions,timeModal,parseTimeChoices,pagedNms,getComponentValue} from '../src/tod-picker.js';

const NOVEMBER=Date.parse('2026-11-16T10:40:00Z');
function wrapped(components){return {components:components.map(([id,value])=>({type:18,label:'Choix',component:{type:3,custom_id:id,values:[value]}}))};}
function data(day,h,t,u){return wrapped([['day',day],['hour',h],['minute_tens',t],['minute_units',u]]);}

test('Jour local: 15 options du jour au J-14, pas de saisie texte',()=>{
 const v=localDayOptions('Europe/Paris',NOVEMBER);
 assert.equal(v.length,15);assert.equal(v[0].value,'2026-11-16');assert.equal(v.at(-1).value,'2026-11-02');
});
test('Formulaire ToD: 4 listes (jour, heure, dizaines et unités) et aucun champ libre',()=>{
 const m=timeModal('Simurgh','simurgh','Europe/Paris',NOVEMBER);
 assert.equal(m.type,9);
 assert.equal(m.data.components.length,4);
 assert.deepEqual(m.data.components.map(x=>x.component.type),[3,3,3,3]);
 assert.deepEqual(m.data.components.map(x=>x.component.options.length),[15,24,6,10]);
});
test('Modal indépendant de D1 : 17 jours autour d’UTC, date/heure toujours sélectionnées',()=>{
 const m=timeModal('Argus','argus',undefined,NOVEMBER);
 assert.equal(m.data.components.length,4);
 assert.deepEqual(m.data.components.map(x=>x.component.options.length),[17,24,6,10]);
 assert.equal(flexibleDayOptions(NOVEMBER).length,17);
 assert.match(m.data.components[0].description,/Fuseau personnel/);
});
test('4 listes donnent un ToD exact à la minute, Europe/Paris -> UTC',()=>{
 const x=parseTimeChoices(data('2026-11-16','11','5','0'),'Europe/Paris',NOVEMBER);
 assert.equal(x.utc,'2026-11-16T10:50:00.000Z');
 assert.equal(x.submittedLocal,'16/11/26 11:50');
});
test('Saisie du jour interdit en dehors des 14 derniers jours',()=>{
 assert.throws(()=>parseTimeChoices(data('2026-10-31','11','5','0'),'Europe/Paris',NOVEMBER),/Jour non autorisé/);
});
test('Impossible de contourner le menu horaire avec des valeurs arbitraires',()=>{
 assert.throws(()=>parseTimeChoices(data('2026-11-16','29','5','0'),'Europe/Paris',NOVEMBER),/Heure invalide/);
 assert.throws(()=>parseTimeChoices(data('2026-11-16','11','9','0'),'Europe/Paris',NOVEMBER),/Minutes invalides/);
});
test('Saisie à l’heure locale ambiguë est refusée',()=>{
 const around=Date.parse('2026-10-25T14:00:00Z');
 assert.throws(()=>parseTimeChoices(data('2026-10-25','02','3','0'),'Europe/Paris',around),/ambiguë/);
});
test('Plus de 25 NM: pagination, préfixe filtrant, pas de label inconnu',()=>{
 const nms=Array.from({length:57},(_,i)=>({slug:`nm${i}`,name:`NM ${String(i).padStart(2,'0')}`}));
 assert.equal(pagedNms(nms).options.length,25);
 assert.equal(pagedNms(nms,'',2).options.length,7);
 assert.equal(pagedNms(nms,'NM 5').count,7);
 assert.equal(pagedNms(nms,'NM 5').options[0].label,'NM 50');
});
test('Le NM est validé par les valeurs de liste de Discord',()=>{
 assert.equal(getComponentValue(wrapped([['day','2026-11-16']]),'day'),'2026-11-16');
});
test('Panneau sans ToD actif: aucun NM ni ToD inconnu listé',async()=>{
 const fake={prepare(sql){assert.match(sql,/JOIN current_tods/);return {bind(){return {all:async()=>({results:[]})}}}}};
 const result=await board(fake,NOVEMBER);
 assert.equal(result.content,'');
 assert.match(result.embeds[0].description,/Aucun ToD actif/);
 assert.doesNotMatch(JSON.stringify(result.embeds),/Argus/);
 assert.equal(result.components.length,2);
 assert.equal(result.components[0].components.length,3);
 assert.equal(result.components[1].components.length,2);
});
test('Panneau avec ToD actif: affiche fenêtre puis met automatiquement à jour heure',async()=>{
 const rows=[{name:'Simurgh',window_start_utc:'2026-11-17T07:30:00.000Z',window_end_utc:'2026-11-17T08:00:00.000Z',local_input:'16/11/26 08:30',source_timezone:'Europe/Paris'}];
 const fake={prepare(){return {bind(){return {all:async()=>({results:rows})}}}}};
 const result=await board(fake,NOVEMBER);
 assert.match(result.embeds[0].fields[0].name,/Simurgh/);
 assert.ok(result.embeds[0].timestamp);
 assert.match(result.embeds[0].footer.text,/Vérifié chaque minute/);
 assert.doesNotMatch(JSON.stringify(result.embeds),/ToD inconnu/);
});
