import {localToUtc, formatInZone} from './time.js';

export const TOD_DAYS = 15; // Jour courant et quatorze jours précédents.
export const MAX_SELECT_OPTIONS = 25;

export function normalizeName(text) {
  return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
}
export function localDayOptions(zone, now = Date.now()) {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(now));
  const map=Object.fromEntries(fields.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const epoch=Date.UTC(Number(map.year),Number(map.month)-1,Number(map.day));
  const out=[];
  for(let i=0;i<TOD_DAYS;i++){
    const iso=new Date(epoch-i*86400000).toISOString().slice(0,10);
    const [year,month,day]=iso.split('-');
    out.push({label:`${day}/${month}/${year}${i===0?' (aujourd’hui)':i===1?' (hier)':''}`,value:iso});
  }
  return out;
}
// Pour l'ouverture instantanée du modal : 17 dates autour du jour UTC.
// Couvre J-14 du jour local pour tous les fuseaux (UTC-12 à UTC+14).
// La validation définitive conserve strictement localDayOptions(zone) :
// 15 jours autorisés, heure locale réelle et gestion des changements d'heure.
export function flexibleDayOptions(now=Date.now()) {
  const d=new Date(now).toISOString().slice(0,10);
  const utc=Date.parse(d+'T00:00:00.000Z');
  const out=[];
  for(let offset=1;offset>=-15;offset--){
    const iso=new Date(utc+offset*86400000).toISOString().slice(0,10);
    const [year,month,day]=iso.split('-');
    out.push({label:`${day}/${month}/${year}`,value:iso});
  }
  return out;
}
export function stringSelect(id, options, placeholder) {
  return {type:3,custom_id:id,options,placeholder,min_values:1,max_values:1};
}
export function modalSelect(label,customId,options,description) {
  return {type:18,label,...(description?{description}:{}),component:stringSelect(customId,options,`Choisir ${label.toLowerCase()}`)};
}
export function timeModal(nmName,slug,zone,now=Date.now()) {
  const hours=Array.from({length:24},(_,h)=>({label:`${String(h).padStart(2,'0')} h`,value:String(h).padStart(2,'0')}));
  const tens=Array.from({length:6},(_,n)=>({label:`${n}0 à ${n}9 minutes`,value:String(n)}));
  const units=Array.from({length:10},(_,n)=>({label:String(n),value:String(n)}));
  return {type:9,data:{title:`ToD — ${nmName}`.slice(0,45),custom_id:`nistod:tod:time:${slug}`,
    components:[
      modalSelect('Jour du ToD','day',zone?localDayOptions(zone,now):flexibleDayOptions(now),zone?`Fuseau : ${zone}`:'Fuseau personnel configuré via Mon fuseau'),
      modalSelect('Heure','hour',hours),
      modalSelect('Dizaines de minutes','minute_tens',tens),
      modalSelect('Unités de minutes','minute_units',units)
    ]}};
}
export function getComponentValue(data,id) {
  const found=[];
  function visit(node){
    if(node?.custom_id===id) {
      if(Array.isArray(node.values))found.push(node.values[0]);
      else if(typeof node.value==='string')found.push(node.value);
    }
    if(node?.component)visit(node.component);
    for(const x of node?.components||[])visit(x);
  }
  visit(data);
  return found[0];
}
export function parseTimeChoices(data,zone,now=Date.now()) {
  const day=getComponentValue(data,'day'),hour=getComponentValue(data,'hour');
  const tens=getComponentValue(data,'minute_tens'),units=getComponentValue(data,'minute_units');
  const allowed=localDayOptions(zone,now).map(x=>x.value);
  if(!allowed.includes(day))throw Error('Jour non autorisé : choisis une date de la liste.');
  if(!/^(0\d|1\d|2[0-3])$/.test(hour||''))throw Error('Heure invalide.');
  if(!/^[0-5]$/.test(tens||'')||!/^[0-9]$/.test(units||''))throw Error('Minutes invalides.');
  const [year,month,date]=day.split('-').map(Number);
  const minute=Number(tens)*10+Number(units);
  const utc=localToUtc(year,month,date,Number(hour),minute,zone);
  const input=`${String(date).padStart(2,'0')}/${String(month).padStart(2,'0')}/${String(year).slice(-2)} ${hour}:${String(minute).padStart(2,'0')}`;
  return {utc,submittedLocal:input,zone};
}
export function pagedNms(rows,query='',page=0) {
  const filtered=rows.filter(r=>normalizeName(r.name).includes(normalizeName(query))||normalizeName(r.slug).includes(normalizeName(query)));
  const total=Math.max(1,Math.ceil(filtered.length/MAX_SELECT_OPTIONS));
  const p=Math.max(0,Math.min(page,total-1));
  return {options:filtered.slice(p*MAX_SELECT_OPTIONS,(p+1)*MAX_SELECT_OPTIONS)
    .map(r=>({label:r.name.slice(0,100),value:r.slug,...(r.zone?{description:r.zone.slice(0,100)}:{})})),
    page:p,pages:total,count:filtered.length};
}
