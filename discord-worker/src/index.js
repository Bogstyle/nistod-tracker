import {parseReport, validTimeZone, addMinutes, unixSeconds, formatInZone} from './time.js';
import {verifyDiscordSignature, discordReply, jsonResponse, discordApi, assertUniqueComponentIds} from './discord.js';
import {LEADS, reminderText, nextReminder} from './subscriptions.js';
import {reporterName, deliverReportLogs} from './report-log.js';
import {normalizeName, pagedNms, stringSelect, timeModal, getComponentValue, parseTimeChoices} from './tod-picker.js';
import {PICKER_NMS,pickerNmBySlug} from './catalog-picker.js';
import {activeText,submissionText,isPersistentSpawn,trackedWhere,reminderEventLabel} from './spawn.js';
import {beginPair,revokePair,addonApi} from './addon-api.js';

const ALERT_SOURCE = 'https://www.bg-wiki.com/ffxi/CatsEyeXI_Content/HNMs';
const DISCORD = 'https://discord.com/api/v10';
const TIMESTAMP = () => new Date().toISOString();
const MAX_AGE_MS = 14 * 86400000;
const ACTIVE_WHERE=trackedWhere();
const ACTIONS = Object.freeze({add:'nistod:add', tz:'nistod:tz', view:'nistod:view', report:'nistod:report', saveTz:'nistod:save-tz', alert:'nistod:alert', listAlerts:'nistod:list-alerts', selectNm:'nistod:select-nm', chooseTodNm:'nistod:tod:nm', searchTodNm:'nistod:tod:search', searchTodSubmit:'nistod:tod:search-submit'});

const norm = normalizeName;
function isAdmin(i) { try { const p = BigInt(i.member?.permissions || 0); return (p & 8n)!==0n || (p & 32n)!==0n; } catch { return false; } }
function actorId(i) { return i.member?.user?.id || i.user?.id; }
function dataResponse(o) {
  try {
    assertUniqueComponentIds(o);
    return jsonResponse(o);
  } catch (e) {
    console.error('Invalid Discord callback', String(e).slice(0,180));
    return jsonResponse(discordReply('❌ Le menu n’a pas pu être construit. Contacte un modérateur.'));
  }
}
function modal(custom_id,title,fields) {
  // Depuis la v2 des composants Discord : Text Inputs contenus dans des Labels (type 18).
  return {type:9,data:{custom_id,title,components:fields.map(f=>({type:18,label:f.label,component:{type:4,custom_id:f.id,style:1,required:true,placeholder:f.placeholder,max_length:f.max||100,...(f.value?{value:f.value}:{})}}))}};
}
function modalText(i, id) {
  const all = i.data?.components || [];
  const values=[];
  function scan(node) { if(node?.custom_id===id && typeof node.value==='string') values.push(node.value);
    if(node?.component)scan(node.component); for(const c of node?.components||[])scan(c); }
  all.forEach(scan); return values[0] || '';
}
async function findNm(db,name) {
  const q=norm(name);
  const {results}=await db.prepare('SELECT * FROM nm_catalog WHERE enabled=1').all();
  const matches=results.filter(x=>norm(x.name)===q||norm(x.slug)===q||JSON.parse(x.aliases).some(a=>norm(a)===q));
  if(matches.length!==1)throw new Error(matches.length>1?'Nom ambigu : précise le NM.':'NM inconnu. Vérifie le nom dans le catalogue CatsEyeXI.');
  return matches[0];
}
async function preference(db, user) {
  return db.prepare('SELECT timezone_iana FROM user_preferences WHERE discord_user_id=?').bind(user).first();
}
function panelButtons(){
  // Deux rangées claires : saisie/consultation, puis notifications personnelles.
  return [
    {type:1,components:[
      {type:2,style:3,label:'Ajouter un ToD',emoji:{name:'➕'},custom_id:ACTIONS.add},
      {type:2,style:2,label:'Mon fuseau',emoji:{name:'🌍'},custom_id:ACTIONS.tz},
      {type:2,style:2,label:'Mes horaires',emoji:{name:'🕒'},custom_id:ACTIONS.view}
    ]},
    {type:1,components:[
      {type:2,style:1,label:'M’alerter en MP',emoji:{name:'🔔'},custom_id:ACTIONS.alert},
      {type:2,style:2,label:'Mes alertes',emoji:{name:'📬'},custom_id:ACTIONS.listAlerts}
    ]}
  ];
}
export async function board(db, now=Date.now()) {
  // Seuls les événements encore actifs apparaissent dans le panneau.
  const data=await db.prepare(`SELECT n.name,n.zone,n.spawn_mode,n.respawn_min_minutes,n.respawn_max_minutes,
    t.window_start_utc,t.window_end_utc,t.occurred_at_utc,e.reporter_discord_id,e.source_timezone,e.local_input
    FROM nm_catalog n JOIN current_tods t ON n.slug=t.nm_slug
    JOIN tod_events e ON t.event_id=e.id WHERE n.enabled=1 AND e.state='accepted' AND ${ACTIVE_WHERE}
    ORDER BY t.window_start_utc,n.name`).bind(new Date(now).toISOString()).all();
  const active=data.results||[];
  const updated=new Date(now).toISOString();
  const header={
    title:'NisToD Tracker  •  CatsEyeXI',
    color:active.length?0x279D89:0x55748B,
    description:active.length
      ?`### 🎯 ${active.length} NM suivi${active.length>1?'s':''} actuellement\nLes dates et heures s’adaptent automatiquement à votre fuseau Discord.`
      :'### 📭 Aucun ToD actif\n\n**Aucune fenêtre à suivre pour le moment.**\n\nUtilisez **➕ Ajouter un ToD** après avoir constaté la mort d’un NM. Le tableau affichera les fenêtres en cours ainsi que les suivis fixed/lottery encore utiles.\n\n🔔 **Rappels privés** : disponibles uniquement pour les NM actuellement suivis.',
    fields:[],
    footer:{text:'NisToD • Vérifié chaque minute • Affichage modifié uniquement si nécessaire'},
    timestamp:updated
  };
  const embeds=[header];
  // Discord limite à 25 champs / embed et à 6000 caractères sur tous les embeds.
  const maxVisible=45;
  let shown=0;
  let usedChars=header.title.length+header.description.length+header.footer.text.length;
  for(const n of active.slice(0,maxVisible)){
    const info=activeText(n,now);
    const value=info.detail+`\n**ToD déclaré** : ${n.local_input} (${n.source_timezone})`;
    if(usedChars+info.name.length+value.length>5300)break;
    if(embeds.at(-1).fields.length===15){embeds.push({color:0x279D89,fields:[]});}
    embeds.at(-1).fields.push({name:info.name,value,inline:false});
    usedChars+=info.name.length+value.length;
    shown++;
  }
  if(active.length>shown){
    embeds.at(-1).fields.push({name:'Autres NM actifs',value:`${active.length-shown} NM supplémentaires. Consultez la commande /nistod-liste.`,inline:false});
  }
  // Embeds sans vieux texte en doublon, avec boutons sur deux lignes.
  return {content:'',embeds,components:panelButtons(),allowed_mentions:{parse:[]}};
}

// Discord affiche lui-même les timestamps relatifs : l'horodatage « actualisé » ne
// doit donc PAS forcer un PATCH à chaque minute. Le digest ignore seulement le
// timestamp de l'embed, mais inclut toute fenêtre, son état et les boutons.
export async function panelDigest(payload){
  const stable={
    content:payload.content,
    embeds:(payload.embeds||[]).map(({timestamp,...rest})=>rest),
    components:payload.components
  };
  const data=new TextEncoder().encode(JSON.stringify(stable));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function updatePanel(env,{force=false}={}){
  const row=await env.DB.prepare("SELECT value FROM app_settings WHERE key='panel'").first();
  if(!row?.value)return {ok:false,reason:'Aucun tableau publié n’est enregistré.'};
  let panel;
  try{panel=JSON.parse(row.value)}catch{return {ok:false,reason:'La référence du tableau est invalide.'};}
  if(!panel.channel_id||!panel.message_id)return {ok:false,reason:'Identifiant de salon ou de message manquant.'};
  try{
    const payload=await board(env.DB);
    const digest=await panelDigest(payload);
    const previous=await env.DB.prepare("SELECT value FROM app_settings WHERE key='panel_signature'").first();
    if(!force && previous?.value===digest)return {ok:true,changed:false};
    await discordApi(env,'PATCH',`/channels/${panel.channel_id}/messages/${panel.message_id}`,payload);
    // Ne persister la signature qu'APRES le succès Discord ; ainsi un HTTP 403
    // ou 429 sera automatiquement retenté au prochain Cron.
    try{
      await env.DB.prepare("INSERT INTO app_settings(key,value) VALUES('panel_signature',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(digest).run();
    }catch(e){console.error('Panel signature save failed',String(e).slice(0,180));}
    return {ok:true,changed:true};
  }catch(e){
    console.error('Panel update failed:',String(e).slice(0,220));
    return {ok:false,reason:'Discord n’a pas pu modifier le message existant. Vérifie les permissions du bot.'};
  }
}
async function publishPanel(env,i){
  const appId=i.application_id, token=i.token;
  try{
    if(!env.TRACKER_CHANNEL_ID)throw new Error('Configurer TRACKER_CHANNEL_ID dans Worker.');
    const message=await discordApi(env,'POST',`/channels/${env.TRACKER_CHANNEL_ID}/messages`,await board(env.DB));
    const ref=JSON.stringify({channel_id:env.TRACKER_CHANNEL_ID,message_id:message.id});
    await env.DB.prepare("INSERT INTO app_settings(key,value) VALUES('panel',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(ref).run();
    await fetch(`${DISCORD}/webhooks/${appId}/${token}/messages/@original`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({content:'✅ Tableau NisToD publié dans le salon configuré.',allowed_mentions:{parse:[]}})});
  }catch(e){console.error('Publish failed:',String(e).slice(0,200));
    await fetch(`${DISCORD}/webhooks/${appId}/${token}/messages/@original`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({content:`❌ Publication impossible : ${String(e.message||e).slice(0,150)}`,allowed_mentions:{parse:[]}})}).catch(()=>{});
  }
}
async function localView(db,zone){
  const {results}=await db.prepare(`SELECT n.name,n.spawn_mode,t.window_start_utc,t.window_end_utc FROM nm_catalog n
    JOIN current_tods t ON t.nm_slug=n.slug JOIN tod_events e ON e.id=t.event_id
    WHERE ${ACTIVE_WHERE} AND e.state='accepted' ORDER BY t.window_start_utc LIMIT 15`).bind(new Date().toISOString()).all();
  const rows=results.map(r=>{
    const mode=r.spawn_mode;
    if(mode==='lottery')return `🎲 ${r.name} : lottery possible dès ${formatInZone(r.window_start_utc,zone)}${r.window_start_utc!==r.window_end_utc?' (cooldown jusque '+formatInZone(r.window_end_utc,zone)+')':''} — PH, non garanti`;
    if(mode==='fixed')return `⏱️ ${r.name} : retour théorique ${formatInZone(r.window_start_utc,zone)} — vérifier en jeu`;
    return `⏳ ${r.name} : ${formatInZone(r.window_start_utc,zone)} → ${formatInZone(r.window_end_utc,zone)}${mode==='placeholder'?' (placeholder, pas le roi)':''}`;
  });
  return `**NisToD — mon fuseau : ${zone}**\n${rows.length?rows.join('\n'):'Aucun ToD encore enregistré.'}`;
}
// Parcours privé : choisir un NM dans un menu puis un délai sur ses boutons.
function privateReply(content, components=[]) {
  return {type:4,data:{content,flags:64,allowed_mentions:{parse:[]},...(components.length?{components}:{})}};
}
async function nmSelectResponse(db, page=0) {
  const {results}=await db.prepare(`SELECT n.slug,n.name,n.zone FROM nm_catalog n
    JOIN current_tods t ON t.nm_slug=n.slug JOIN tod_events e ON e.id=t.event_id
    WHERE n.enabled=1 AND e.state='accepted' AND ${ACTIVE_WHERE}
    ORDER BY n.name`).bind(TIMESTAMP()).all();
  if(!results.length)return discordReply('📭 **Aucun ToD disponible actuellement.** Les rappels peuvent être choisis quand un ToD confirmé est enregistré.');
  const listing=pagedNms(results,'',page);
  const rows=[{type:1,components:[stringSelect(ACTIONS.selectNm,listing.options,'Choisir un NM ayant un ToD actif')]}];
  if(listing.pages>1) rows.push({type:1,components:[
    {type:2,style:2,label:'◀ Précédents',disabled:listing.page===0,custom_id:`nistod:alert:page:${listing.page-1}`},
    {type:2,style:2,label:`Page ${listing.page+1}/${listing.pages}`,disabled:true,custom_id:'nistod:alert:counter'},
    {type:2,style:2,label:'Suivants ▶',disabled:listing.page===listing.pages-1,custom_id:`nistod:alert:page:${listing.page+1}`}
  ]});
  return privateReply('🔔 **Choisis un NM avec un ToD actif :**', rows);
}

// La saisie démarre immédiatement : ce catalogue embarqué est un instantané
// des 37 NM des migrations 0001+0004+0005. Aucun aller-retour D1 ni webhook
// supplémentaire pour le bouton, la pagination ou la recherche.
export function todNmPicker(page=0,prefix='',catalog=PICKER_NMS) {
  const listing=pagedNms(catalog,prefix,page);
  const rows=[];
  if(listing.count){
    const options=listing.options.map(o=>{
      const descriptiveValue=`${o.value}|${o.label}`;
      return {...o,value:descriptiveValue.length<=100?descriptiveValue:o.value};
    });
    rows.push({type:1,components:[stringSelect(ACTIONS.chooseTodNm,options,'Sélectionne le NM dans la liste')]});
  }
  rows.push({type:1,components:[
    {type:2,style:2,label:'◀',custom_id:`nistod:tod:page:${Math.max(0,listing.page-1)}:${encodeURIComponent(prefix)}:previous`,disabled:listing.page===0},
    {type:2,style:2,label:'▶',custom_id:`nistod:tod:page:${Math.min(listing.page+1,listing.pages-1)}:${encodeURIComponent(prefix)}:next`,disabled:listing.page>=listing.pages-1},
    {type:2,style:1,label:'🔎 Chercher par lettres',custom_id:ACTIONS.searchTodNm},
    {type:2,style:2,label:'Tous les NM',custom_id:'nistod:tod:page:0::reset'}
  ]});
  return privateReply((listing.count?`🎯 **Choisis un NM** (${listing.count} résultats, page ${listing.page+1}/${listing.pages}).`:
    '📭 Aucun NM ne correspond. Essaie d’autres lettres ou affiche tous les NM.')+
    '\n**Nom, date et heure : sélection uniquement, aucune saisie libre.**\n'+
    '🌍 Ton fuseau défini via « Mon fuseau » sera utilisé lors de la confirmation.',rows);
}
async function showAlertOptions(db, user, slug) {
  const nm=await db.prepare(`SELECT n.slug,n.name,n.spawn_mode,t.window_start_utc FROM nm_catalog n
    JOIN current_tods t ON t.nm_slug=n.slug JOIN tod_events e ON e.id=t.event_id
    WHERE n.enabled=1 AND n.slug=? AND e.state='accepted' AND ${ACTIVE_WHERE}`)
    .bind(slug,TIMESTAMP()).first();
  if(!nm)return discordReply('📭 Aucun ToD actif pour ce NM. Le choix des rappels n’est disponible que pendant une fenêtre suivie.');
  const sub=await db.prepare('SELECT lead_minutes FROM dm_subscriptions WHERE discord_user_id=? AND nm_slug=?').bind(user,slug).first();
  const tod=await db.prepare('SELECT window_start_utc FROM current_tods WHERE nm_slug=?').bind(slug).first();
  const prefix=sub?`✅ Rappel actuel : **${sub.lead_minutes} min avant**.`:'Aucun rappel actif pour ce NM.';
  const next=tod?`Rappel relatif à ${reminderEventLabel(nm.spawn_mode)} : <t:${unixSeconds(tod.window_start_utc)}:F>.`:'ToD inconnu pour le moment.';
  const leadButtons=LEADS.map(min=>({type:2,style:sub?.lead_minutes===min?3:1,label:min===60?'1 heure avant':`${min} min avant`,custom_id:`nistod:subscribe:${slug}:${min}`}));
  return privateReply(`**🔔 ${nm.name}** — ${prefix}\n${next}\nL'abonnement reste actif pour les prochains kills jusqu'à annulation.`,
    [{type:1,components:leadButtons},{type:1,components:[{type:2,style:4,label:'Annuler mes rappels',custom_id:`nistod:unsubscribe:${slug}`}]}]);
}
async function listMyAlerts(db,user){
  const {results}=await db.prepare(`SELECT n.slug,n.name,n.spawn_mode,s.lead_minutes,t.window_start_utc,t.window_end_utc
    FROM dm_subscriptions s JOIN nm_catalog n ON n.slug=s.nm_slug
    LEFT JOIN current_tods t ON t.nm_slug=s.nm_slug
    WHERE s.discord_user_id=? ORDER BY n.name`).bind(user).all();
  if(!results.length)return discordReply('📬 Tu n’as aucun abonnement. Le bouton 🔔 proposera les NM ayant un ToD actif.');
  const entries=results.map(x=>{
    const active=x.window_end_utc&&(isPersistentSpawn(x.spawn_mode)||Date.parse(x.window_end_utc)>Date.now());
    return `• **${x.name}** — ${x.lead_minutes===60?'1 h':x.lead_minutes+' min'} avant`+
      (active?((x.spawn_mode==='lottery'?' · lottery possible à partir de ':x.spawn_mode==='fixed'?' · retour théorique : ':' · prochaine fenêtre ')+ '<t:'+unixSeconds(x.window_start_utc)+':f>'):' · en attente d’un nouveau ToD');
  });
  const options=results.slice(0,25).map(r=>({label:r.name,value:r.slug,description:'Modifier ou annuler cet abonnement'}));
  return privateReply('📬 **Mes rappels NisToD**\n'+entries.join('\n')+
    '\nSélectionne un abonnement ci-dessous pour le modifier ou l’annuler, même en l’absence de ToD actif.',
    [{type:1,components:[stringSelect('nistod:manage-sub',options,'Gérer un abonnement')]}]);
}

async function configureDm(env,i,slug,lead){
  const user=actorId(i);if(!user)return discordReply('Compte Discord non identifié.');
  const nm=await env.DB.prepare(`SELECT n.name,n.spawn_mode FROM nm_catalog n
    JOIN current_tods t ON t.nm_slug=n.slug JOIN tod_events e ON e.id=t.event_id
    WHERE n.slug=? AND n.enabled=1 AND e.state='accepted' AND ${ACTIVE_WHERE}`)
    .bind(slug,TIMESTAMP()).first();
  if(!nm||!LEADS.includes(lead))return discordReply('❌ Ce NM n’a pas de ToD actif, ou le délai est invalide.');
  // Tester l’envoi au moment de l’opt-in. Un MP bloqué ne crée pas de faux abonnement.
  try{
    const channel=await discordApi(env,'POST','/users/@me/channels',{recipient_id:user});
    await discordApi(env,'POST',`/channels/${channel.id}/messages`,{content:`✅ **NisToD Tracker** — Les MP fonctionnent. Configuration du rappel pour **${nm.name}** (${lead===60?'1 heure':lead+' minutes'} avant ${reminderEventLabel(nm.spawn_mode)}).`,allowed_mentions:{parse:[]}});
  }catch(e){console.error('DM opt-in failed',String(e).slice(0,120));return discordReply('❌ Je ne peux pas t’envoyer de MP. Autorise les messages privés de ce serveur ou débloque le bot, puis réessaie. Aucun abonnement créé.');}
  await env.DB.prepare(`INSERT INTO dm_subscriptions(discord_user_id,nm_slug,lead_minutes,created_at_utc,updated_at_utc)
    VALUES(?,?,?,?,?) ON CONFLICT(discord_user_id,nm_slug) DO UPDATE SET lead_minutes=excluded.lead_minutes,updated_at_utc=excluded.updated_at_utc`)
    .bind(user,slug,lead,TIMESTAMP(),TIMESTAMP()).run();
  const tod=await env.DB.prepare('SELECT window_start_utc FROM current_tods WHERE nm_slug=?').bind(slug).first();
  const future=tod?nextReminder(tod.window_start_utc,lead):null;
  const info=future?`Prochain rappel avant ${reminderEventLabel(nm.spawn_mode)} : <t:${unixSeconds(future)}:f>.`:(tod?'Le délai choisi est déjà passé pour le prochain repère ; tu recevras le rappel lors du prochain cycle connu.':'Le rappel sera programmé dès qu’un prochain ToD sera enregistré.');
  return discordReply(`✅ Rappel privé activé pour **${nm.name}**, **${lead===60?'1 h':lead+' min'} avant**. ${info} Tu peux modifier ou annuler à tout moment.`);
}
async function removeDm(db,i,slug){
  const nm=await db.prepare('SELECT name FROM nm_catalog WHERE slug=?').bind(slug).first();
  await db.prepare('DELETE FROM dm_subscriptions WHERE discord_user_id=? AND nm_slug=?').bind(actorId(i),slug).run();
  return discordReply(`✅ Plus aucun rappel privé pour **${nm?.name||slug}**.`);
}
async function saveSelectedTod(env,i,draft) {
  const user=actorId(i), zone=draft.timezone_iana, displayedName=reporterName(i);
  try {
    if(!user)throw new Error('Impossible de déterminer votre compte Discord.');
    if(!validTimeZone(zone))throw new Error('Fuseau horaire invalide.');
    const nm=await env.DB.prepare('SELECT * FROM nm_catalog WHERE slug=? AND enabled=1').bind(draft.nm_slug).first();
    if(!nm)throw new Error('Ce NM a été désactivé entre-temps.');
    const death=Date.parse(draft.occurred_at_utc),now=Date.now();
    if(death>now+5*60000)throw new Error('Le ToD ne peut pas se situer dans le futur.');
    if(death<now-MAX_AGE_MS)throw new Error('ToD trop ancien (plus de 14 jours).');
    const current=await env.DB.prepare('SELECT occurred_at_utc FROM current_tods WHERE nm_slug=?').bind(nm.slug).first();
    const conflicts=current&&death<Date.parse(current.occurred_at_utc)+nm.respawn_min_minutes*60000;
    const state=conflicts?'conflict':'accepted';
    // Idempotence sur la saisie préparée et confirmée, même si le joueur double-clique.
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO tod_events
      (discord_interaction_id,nm_slug,event_type,occurred_at_utc,source_timezone,local_input,reporter_discord_id,reporter_display_name,created_at_utc,state)
      VALUES(?,?,'KILL_CONFIRMED',?,?,?,?,?,?,?)`)
      .bind(`tod-draft:${draft.id}`,nm.slug,draft.occurred_at_utc,zone,draft.local_input,user,displayedName,TIMESTAMP(),state).run();
    if(!inserted.meta?.changes) return discordReply('Ce ToD a déjà été confirmé. Aucun doublon créé.');
    await env.DB.prepare(`INSERT INTO user_preferences(discord_user_id,timezone_iana,updated_at)
      VALUES(?,?,?) ON CONFLICT(discord_user_id) DO UPDATE SET timezone_iana=excluded.timezone_iana,updated_at=excluded.updated_at`)
      .bind(user,zone,TIMESTAMP()).run();
    if(conflicts)return discordReply(`⚠️ Signalement contradictoire conservé dans #log : ${nm.name}. Le tableau n'a pas été modifié.`);
    const entry=await env.DB.prepare('SELECT id FROM tod_events WHERE discord_interaction_id=?').bind(`tod-draft:${draft.id}`).first();
    await env.DB.prepare(`INSERT INTO current_tods
      (nm_slug,event_id,occurred_at_utc,window_start_utc,window_end_utc,updated_at_utc)
      VALUES(?,?,?,?,?,?) ON CONFLICT(nm_slug) DO UPDATE SET event_id=excluded.event_id,
      occurred_at_utc=excluded.occurred_at_utc,window_start_utc=excluded.window_start_utc,
      window_end_utc=excluded.window_end_utc,updated_at_utc=excluded.updated_at_utc`)
      .bind(nm.slug,entry.id,draft.occurred_at_utc,addMinutes(draft.occurred_at_utc,nm.respawn_min_minutes),addMinutes(draft.occurred_at_utc,nm.respawn_max_minutes),TIMESTAMP()).run();
    return discordReply(`✅ **${nm.name}** enregistré.\nToD : ${draft.local_input} (${zone}).\n${submissionText(nm,draft.occurred_at_utc)}`);
  } catch(e) { return discordReply(`❌ ${String(e.message||e).slice(0,300)}`); }
}
async function confirmTod(env,i,draftId) {
  const draft=await env.DB.prepare('SELECT * FROM tod_drafts WHERE id=? AND reporter_discord_id=?').bind(draftId,actorId(i)).first();
  if(!draft)return discordReply('Brouillon absent ou non autorisé.');
  if(draft.status!=='open'||Date.parse(draft.expires_at_utc)<Date.now())return discordReply('Ce brouillon est expiré ou déjà utilisé. Recommence depuis ➕.');
  const claim=await env.DB.prepare("UPDATE tod_drafts SET status='used' WHERE id=? AND reporter_discord_id=? AND status='open' AND expires_at_utc>?")
    .bind(draftId,actorId(i),TIMESTAMP()).run();
  if(!claim.meta?.changes)return discordReply('Brouillon déjà confirmé ou expiré.');
  const resp=await saveSelectedTod(env,i,draft);
  return resp;
}
export async function removeActiveTod(env,i,rawName,reason='') {
  const nm=await findNm(env.DB,rawName);
  const row=await env.DB.prepare('SELECT event_id FROM current_tods WHERE nm_slug=?').bind(nm.slug).first();
  if(!row)return discordReply(`ℹ️ **${nm.name}** n'a pas de ToD à retirer.`);
  await env.DB.batch([
    env.DB.prepare(`UPDATE tod_events SET state='invalidated',invalidated_by_discord_id=?,
       invalidated_by_display_name=?,invalidation_reason=? WHERE id=? AND nm_slug=? AND state='accepted'`)
      .bind(actorId(i),reporterName(i),String(reason||'Retiré par modération').slice(0,240),row.event_id,nm.slug),
    env.DB.prepare('DELETE FROM current_tods WHERE nm_slug=? AND event_id=?').bind(nm.slug,row.event_id)
  ]);
  const remain=await env.DB.prepare('SELECT event_id FROM current_tods WHERE nm_slug=?').bind(nm.slug).first();
  if(remain?.event_id===row.event_id)throw new Error('Retrait non confirmé, vérifier D1.');
  return discordReply(`🛑 ToD de **${nm.name}** invalidé par la modération. La fenêtre est retirée ; le journal #log conserve la trace.`);
}

async function deliverDeferredInteraction(env,i,operation){
  let message;
  try{
    const outcome=await operation;
    const data=outcome?.data || {};
    message={content:data.content || 'Action terminée.',allowed_mentions:{parse:[]},
      components:Array.isArray(data.components)?data.components:[]};
    if(Array.isArray(data.embeds))message.embeds=data.embeds;
  }catch(e){
    console.error('Deferred interaction failed',String(e).slice(0,150));
    message={content:'❌ Erreur lors de la configuration. Réessaie.',components:[],allowed_mentions:{parse:[]}};
  }
  try{
    const response=await fetch(`${DISCORD}/webhooks/${i.application_id}/${i.token}/messages/@original`,{
      method:'PATCH',headers:{'content-type':'application/json'},
      body:JSON.stringify(message)
    });
    if(!response.ok){
      const details=(await response.text().catch(()=>'' )).slice(0,600);
      console.error('Deferred response HTTP',response.status,details);
      // Si les composants sont refusés, ne laisse pas l'utilisateur avec
      // un indicateur « réfléchit… » sans fin.
      if(message.components?.length){
        await fetch(`${DISCORD}/webhooks/${i.application_id}/${i.token}/messages/@original`,{
          method:'PATCH',headers:{'content-type':'application/json'},
          body:JSON.stringify({content:'❌ Discord a refusé le menu. Contacte un modérateur (voir journaux Cloudflare).',components:[]})
        }).catch(()=>{});
      }
    }
  }catch(e){console.error('Deferred response failed',String(e).slice(0,120));}
}
export async function handleInteraction(i,env,ctx){
  if(i.type===1)return {type:1};
  if(env.DISCORD_GUILD_ID&&i.guild_id!==env.DISCORD_GUILD_ID)return discordReply('Ce bot est réservé au serveur Discord configuré.');
  if(i.type===4) {
    if(i.data?.name!=='nistod-retirer'||!isAdmin(i))return {type:8,data:{choices:[]}};
    const query=norm(i.data?.options?.find(x=>x.focused)?.value||'');
    const {results}=await env.DB.prepare('SELECT slug,name FROM nm_catalog WHERE enabled=1 ORDER BY name').all();
    const choices=results.filter(x=>norm(x.name).includes(query)||norm(x.slug).includes(query)).slice(0,25)
      .map(x=>({name:x.name,value:x.slug}));
    return {type:8,data:{choices}};
  }
  if(i.type===2){
    const name=i.data?.name;
    if(name==='nistod-lier'){
      const user=actorId(i);if(!user)return discordReply('Compte Discord absent.');
      const v=await beginPair(env.DB,user,reporterName(i));
      return discordReply(`🔐 **Appairage NisToD**\nCode privé à usage unique : **${v.code}**\nValide pendant 10 minutes. Utilise-le uniquement avec ton relais local NisToD. Ne le partage pas.`,true);
    }
    if(name==='nistod-delier'){
      const user=actorId(i);if(!user)return discordReply('Compte Discord absent.');
      await revokePair(env.DB,user);
      return discordReply('🔒 Appairages et codes NisToD révoqués. Aucun ToD existant n’est supprimé.');
    }
    if(name==='nistod-publier'){
      if(!isAdmin(i))return discordReply('Permission Gérer le serveur requise.');
      ctx.waitUntil(publishPanel(env,i));return {type:5,data:{flags:64}};
    }
    if(name==='nistod-liste'){
      const pref=await preference(env.DB,actorId(i)); const zone=pref?.timezone_iana||'UTC';
      return discordReply(await localView(env.DB,zone));
    }
    if(name==='nistod-rafraichir'){
      if(!isAdmin(i))return discordReply('Permission Gérer le serveur requise.');
      // Met à jour le MESSAGE EXISTANT par PATCH. Ne crée pas un second panneau.
      const operation=updatePanel(env,{force:true}).then(result=>discordReply(result.ok
        ? '✅ Tableau NisToD actualisé dans #nm-tracker (même message, aucun doublon).'
        : `❌ Actualisation impossible : ${result.reason}`));
      ctx.waitUntil(deliverDeferredInteraction(env,i,operation));
      return {type:5,data:{flags:64}};
    }
    if(name==='nistod-retirer'){
      if(!isAdmin(i))return discordReply('Permission Gérer le serveur requise.');
      const nm=i.data?.options?.find(x=>x.name==='nm')?.value;
      const reason=i.data?.options?.find(x=>x.name==='raison')?.value||'';
      if(!nm)return discordReply('Choisis un NM valide.');
      const operation=removeActiveTod(env,i,nm,reason).then(async(resp)=>{
        if(resp.data?.content?.startsWith('🛑')){
          await Promise.allSettled([updatePanel(env),deliverReportLogs(env)]);
        }
        return resp;
      });
      ctx.waitUntil(deliverDeferredInteraction(env,i,operation));
      return {type:5,data:{flags:64}};
    }
    return discordReply('Commande non reconnue.');
  }
  if(i.type===3){
    const id=i.data?.custom_id;
    if(id===ACTIONS.add){
      // Une SEULE réponse type 4 : ni D1 ni PATCH différé. Supprime le blocage
      // infini sur « réfléchit… » qui survenait en v0.1.8.
      return todNmPicker();
    }
    if(id===ACTIONS.searchTodNm){
      return modal(ACTIONS.searchTodSubmit,'Rechercher un NM',[
        {id:'prefix',label:'Quelques lettres du nom',placeholder:'Ex. simu, arg, cent...',max:40}
      ]);
    }
    if(id.startsWith('nistod:tod:page:')) {
      const parts=id.slice('nistod:tod:page:'.length).split(':');
      // Le dernier segment est l'identifiant de l'action (previous/next/reset).
      // Il ne fait pas partie du filtre ; les vieux IDs v0.1.9 sans action sont aussi reconnus.
      const page=Number(parts[0])||0,prefix=decodeURIComponent(parts[1]||'').slice(0,40);
      return todNmPicker(page,prefix);
    }
    if(id===ACTIONS.chooseTodNm || id?.startsWith(`${ACTIONS.chooseTodNm}:`)){
      const selected=String(i.data?.values?.[0]||'');
      const slug=selected.split('|')[0];
      const nm=pickerNmBySlug(slug);
      if(!nm)return discordReply('NM indisponible dans le catalogue de cette version.');
      // Aucun accès D1 avant la réponse au clic du menu.
      // Le fuseau réel de l'utilisateur sera lu et appliqué lors de la validation.
      return timeModal(nm.name,nm.slug);
    }
    if(id.startsWith('nistod:tod:confirm:')){
      const draftId=id.slice('nistod:tod:confirm:'.length);
      const resp=await confirmTod(env,i,draftId);
      if(resp.data?.content?.startsWith('✅'))ctx.waitUntil(updatePanel(env));
      if(/^(✅|⚠️)/u.test(resp.data?.content||''))ctx.waitUntil(deliverReportLogs(env));
      return resp;
    }
    if(id.startsWith('nistod:tod:cancel:')){
      const draftId=id.slice('nistod:tod:cancel:'.length);
      await env.DB.prepare("UPDATE tod_drafts SET status='cancelled' WHERE id=? AND reporter_discord_id=? AND status='open'")
        .bind(draftId,actorId(i)).run();
      return discordReply('❎ Saisie annulée. Aucun ToD enregistré.');
    }
    if(id.startsWith('nistod:alert:page:'))return nmSelectResponse(env.DB,Number(id.slice('nistod:alert:page:'.length))||0);
    if(id===ACTIONS.tz){const pref=await preference(env.DB,actorId(i));
      return modal(ACTIONS.saveTz,'Mon fuseau horaire',[
        {id:'zone',label:'Fuseau horaire IANA',placeholder:'Europe/Paris',value:pref?.timezone_iana||'',max:60}
      ]);
    }
    if(id===ACTIONS.view){const pref=await preference(env.DB,actorId(i));if(!pref)return discordReply('Cliquez d’abord sur 🌍 Mon fuseau pour définir votre fuseau.');
      return discordReply(await localView(env.DB,pref.timezone_iana));}
    if(id===ACTIONS.alert)return nmSelectResponse(env.DB);
    if(id===ACTIONS.listAlerts)return listMyAlerts(env.DB,actorId(i));
    if(id==='nistod:manage-sub'){
      const slug=i.data?.values?.[0];
      const sub=await env.DB.prepare('SELECT lead_minutes FROM dm_subscriptions WHERE discord_user_id=? AND nm_slug=?').bind(actorId(i),slug).first();
      if(!sub)return discordReply('Cet abonnement n’existe plus.');
      const r=await showAlertOptions(env.DB,actorId(i),slug);
      if(r.data?.content?.startsWith('📭')){
        const nm=await env.DB.prepare('SELECT name FROM nm_catalog WHERE slug=?').bind(slug).first();
        return privateReply(`🔔 **${nm?.name||slug}** — rappel actif ${sub.lead_minutes} min avant.\nToD inconnu : les modifications de délai sont momentanément indisponibles ; tu peux annuler ci-dessous.`,
          [{type:1,components:[{type:2,style:4,label:'Annuler cet abonnement',custom_id:`nistod:unsubscribe:${slug}`}]}]);
      }
      return r;
    }
    if(id===ACTIONS.selectNm){const slug=i.data?.values?.[0];return showAlertOptions(env.DB,actorId(i),slug);}
    if(id?.startsWith('nistod:subscribe:')){
      const parts=id.split(':');if(parts.length!==4)return discordReply('Action invalide.');
      ctx.waitUntil(deliverDeferredInteraction(env,i,configureDm(env,i,parts[2],Number(parts[3]))));
      return {type:5,data:{flags:64}};
    }
    if(id?.startsWith('nistod:unsubscribe:')){
      const parts=id.split(':');if(parts.length!==3)return discordReply('Action invalide.');
      return removeDm(env.DB,i,parts[2]);
    }
  }
  if(i.type===5){
    const id=i.data?.custom_id;
    if(id===ACTIONS.saveTz){
      const zone=modalText(i,'zone').trim();if(!validTimeZone(zone))return discordReply('❌ Fuseau invalide : ex. Europe/Paris ou America/Montreal.');
      await env.DB.prepare(`INSERT INTO user_preferences(discord_user_id,timezone_iana,updated_at) VALUES(?,?,?)
        ON CONFLICT(discord_user_id) DO UPDATE SET timezone_iana=excluded.timezone_iana,updated_at=excluded.updated_at`).bind(actorId(i),zone,TIMESTAMP()).run();
      return discordReply(`✅ Fuseau personnel enregistré : **${zone}**. Clique sur « Mes horaires » pour l’utiliser.`);
    }
    if(id===ACTIONS.report)return discordReply('❌ Cet ancien formulaire est remplacé. Utilise ➕ pour choisir un NM, une date et une heure via les menus.');
    if(id===ACTIONS.searchTodSubmit){
      const prefix=(getComponentValue(i.data,'prefix')||'').trim().slice(0,40);
      return todNmPicker(0,prefix);
    }
    if(id.startsWith('nistod:tod:time:')){
      const slug=id.slice('nistod:tod:time:'.length);
      const pref=await preference(env.DB,actorId(i));
      if(!pref?.timezone_iana)return discordReply('Choisis d’abord ton fuseau avec 🌍 Mon fuseau.');
      try {
        const nm=await env.DB.prepare('SELECT * FROM nm_catalog WHERE slug=? AND enabled=1').bind(slug).first();
        if(!nm)throw Error('Ce NM n’est plus disponible.');
        const parsed=parseTimeChoices(i.data,pref.timezone_iana);
        const death=Date.parse(parsed.utc),now=Date.now();
        if(death>now+5*60000)throw Error('Le ToD ne peut pas être dans le futur.');
        if(death<now-MAX_AGE_MS)throw Error('ToD trop ancien (plus de 14 jours).');
        const draftId=crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO tod_drafts(id,reporter_discord_id,nm_slug,occurred_at_utc,
          timezone_iana,local_input,created_at_utc,expires_at_utc,status)
          VALUES(?,?,?,?,?,?,?,?,'open')`)
          .bind(draftId,actorId(i),nm.slug,parsed.utc,pref.timezone_iana,parsed.submittedLocal,TIMESTAMP(),new Date(now+15*60000).toISOString()).run();
        return privateReply(`📝 **Confirmer ce ToD ?**\n🎯 **${nm.name}**\n☠️ ${parsed.submittedLocal} (${pref.timezone_iana})\n\n${submissionText(nm,parsed.utc)}\n\n⚠️ Ne confirme que si la mort a réellement été constatée.`,[
          {type:1,components:[
            {type:2,style:3,label:'✅ Confirmer le ToD',custom_id:`nistod:tod:confirm:${draftId}`},
            {type:2,style:4,label:'❌ Annuler',custom_id:`nistod:tod:cancel:${draftId}`}
          ]}
        ]);
      } catch(e){return discordReply(`❌ ${String(e.message||e).slice(0,220)}`);}
    }
  }
  return discordReply('Cette interaction n’est pas prise en charge.');
}
async function deliverAlerts(env){
  if(!env.DISCORD_BOT_TOKEN)return;
  const now=Date.now();
  const {results}=await env.DB.prepare(`SELECT s.discord_user_id,s.nm_slug,s.lead_minutes,t.event_id,
    t.window_start_utc,t.window_end_utc,n.name,n.spawn_mode
    FROM dm_subscriptions s JOIN current_tods t ON t.nm_slug=s.nm_slug
    JOIN nm_catalog n ON n.slug=s.nm_slug WHERE n.enabled=1`).all();
  for(const row of results){
    const due=Date.parse(row.window_start_utc)-row.lead_minutes*60000;
    // Ne jamais envoyer rétroactivement un rappel datant de plusieurs minutes.
    if(now<due||now>=due+5*60000)continue;
    const key=[row.discord_user_id,row.nm_slug,row.event_id,row.lead_minutes];
    const claim=await env.DB.prepare(`INSERT OR IGNORE INTO dm_deliveries
      (discord_user_id,nm_slug,event_id,lead_minutes,state,attempted_at_utc)
      VALUES(?,?,?,?,'claimed',?)`).bind(...key,TIMESTAMP()).run();
    if(!claim.meta?.changes){continue;}
    // Vérifier que le ToD courant n'a pas été modifié entre la lecture et l'envoi.
    const live=await env.DB.prepare('SELECT event_id FROM current_tods WHERE nm_slug=?').bind(row.nm_slug).first();
    const sub=await env.DB.prepare('SELECT lead_minutes FROM dm_subscriptions WHERE discord_user_id=? AND nm_slug=?').bind(row.discord_user_id,row.nm_slug).first();
    if(live?.event_id!==row.event_id||sub?.lead_minutes!==row.lead_minutes)continue;
    let state='failed',reason=null;
    try{
      const dm=await discordApi(env,'POST','/users/@me/channels',{recipient_id:row.discord_user_id});
      await discordApi(env,'POST',`/channels/${dm.id}/messages`,{content:reminderText(row.name,row.window_start_utc,row.window_end_utc,row.lead_minutes,row.spawn_mode),allowed_mentions:{parse:[]}});
      state='delivered';
    }catch(e){reason=String(e).slice(0,120);
      if(/50007|50278/.test(reason)){state='blocked';}
      console.error('DM reminder failed',row.nm_slug,state,reason);
    }
    await env.DB.prepare(`UPDATE dm_deliveries SET state=?,delivered_at_utc=?,last_error=?
      WHERE discord_user_id=? AND nm_slug=? AND event_id=? AND lead_minutes=?`)
      .bind(state,state==='delivered'?TIMESTAMP():null,reason,...key).run();
  }
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET')return jsonResponse({ok:true,project:'NisToD Tracker',phase:'companion opt-in',version:'0.3.0'});
    if(url.pathname.startsWith('/api/v1/addon/'))return addonApi(request,env,ctx,{updatePanel:()=>updatePanel(env),deliverReportLogs:()=>deliverReportLogs(env)});
    if(url.pathname!=='/discord/interactions'||request.method!=='POST')return new Response('Not found',{status:404});
    const raw=await request.text();
    if(!(await verifyDiscordSignature(raw,request.headers.get('X-Signature-Timestamp'),request.headers.get('X-Signature-Ed25519'),env.DISCORD_PUBLIC_KEY)))
      return new Response('Signature invalid',{status:401});
    try{return dataResponse(await handleInteraction(JSON.parse(raw),env,ctx));}
    catch(e){console.error('Interaction failed',String(e).slice(0,220));return dataResponse(discordReply('❌ Erreur interne. Contacte un modérateur.'));}
  },
  async scheduled(event,env,ctx){ctx.waitUntil(Promise.allSettled([deliverAlerts(env),deliverReportLogs(env),updatePanel(env)]));}
};
