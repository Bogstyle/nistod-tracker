// La distinction est fondamentale : une "lottery" n'a jamais une apparition garantie.
// Les noms de modes sont stockés dans nm_catalog.spawn_mode (migration 0005).
import {unixSeconds} from './time.js';

export function spawnMode(mode) {
  return ['window','fixed','lottery','placeholder'].includes(mode)?mode:'window';
}
export function isPersistentSpawn(mode) {
  return ['fixed','lottery'].includes(spawnMode(mode));
}
export function trackedWhere(alias='n') {
  // Utilisé à l'identique pour panneau, commandes, rappels et menus d'abonnement.
  return `(${alias}.spawn_mode IN ('fixed','lottery') OR t.window_end_utc>?)`;
}
export function activeText(n, now=Date.now()) {
  const mode=spawnMode(n.spawn_mode);
  const start=Date.parse(n.window_start_utc), end=Date.parse(n.window_end_utc);
  const st=`<t:${unixSeconds(n.window_start_utc)}:f>`;
  const en=`<t:${unixSeconds(n.window_end_utc)}:t>`;
  if(mode==='lottery') {
    const current=now<start?'⏳ Cooldown minimal en cours':now<end?'🎲 Lottery : retour possible, cooldown variable':'🎲 Cooldown maximal écoulé : surveiller les PH';
    const range=start===end?`à partir de ${st}`:`entre ${st} et <t:${unixSeconds(n.window_end_utc)}:f>`;
    return {state:current,name:`🎲 ${n.name}`,detail:`**Lottery / cooldown** : ${range}\n**État** : ${current}\n⚠️ **Aucune apparition garantie** ; dépend des PH. Le suivi reste visible jusqu’à un nouveau ToD ou un retrait.`};
  }
  if(mode==='fixed') {
    const current=now<start?'⏳ Retour estimé non atteint':'🟢 Heure théorique atteinte : vérifier en jeu';
    return {state:current,name:`⏱️ ${n.name}`,detail:`**Retour théorique** : ${st}\n**État** : ${current}\n⚠️ Présence à vérifier en jeu ; suivi conservé jusqu’à un nouveau ToD ou un retrait.`};
  }
  const current=now<start?'⏳ En attente':now<=end?'🟢 Fenêtre ouverte':'⚠️ À contrôler';
  const qualifier=mode==='placeholder'?'**Placeholder uniquement** (pas la fenêtre du roi)':'**Prochaine fenêtre**';
  return {state:current,name:`${now<start?'⏳':'🟢'} ${n.name}`,detail:`${qualifier} : ${st} → ${en}\n**État** : ${current}`};
}
export function submissionText(n, iso){
  const start=new Date(Date.parse(iso)+n.respawn_min_minutes*60000).toISOString();
  const end=new Date(Date.parse(iso)+n.respawn_max_minutes*60000).toISOString();
  const mode=spawnMode(n.spawn_mode),a=`<t:${unixSeconds(start)}:f>`,b=`<t:${unixSeconds(end)}:f>`;
  if(mode==='lottery')return `🎲 Cooldown estimé : ${a}${start===end?'':` → ${b}`} ; aucune apparition garantie (lottery des PH).`;
  if(mode==='fixed')return `⏱️ Retour théorique : ${a} (à vérifier en jeu).`;
  if(mode==='placeholder')return `🛡️ Fenêtre du placeholder : ${a} → ${b} (pas celle du roi).`;
  return `Fenêtre : ${a} → <t:${unixSeconds(end)}:t>.`;
}
export function reminderEventLabel(mode){
  if(spawnMode(mode)==='lottery')return 'le début possible du cooldown / lottery (apparition non garantie)';
  if(spawnMode(mode)==='fixed')return 'l’heure théorique de retour (présence à vérifier en jeu)';
  if(spawnMode(mode)==='placeholder')return 'la fenêtre du placeholder (pas du roi)';
  return 'l’ouverture de la fenêtre estimée';
}
