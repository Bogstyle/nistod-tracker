import {discordApi} from './discord.js';
import {unixSeconds} from './time.js';

export function reporterName(i) {
  const person=i.member?.user || i.user || {};
  const raw=i.member?.nick || person.global_name || person.username || 'Utilisateur Discord';
  return String(raw).replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,80) || 'Utilisateur Discord';
}
function clean(text, max=100) {
  return String(text ?? '').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max)
    .replace(/[\\`*_~|<>]/g,'\\$&').replace(/@/g,'@\u200b');
}
export function reportMessage(row) {
  const who=clean(row.reporter_display_name||'Joueur Discord',80);
  const uid=/^\d{17,22}$/.test(String(row.reporter_discord_id||'')) ? ` (<@${row.reporter_discord_id}>)` : '';
  const nm=clean(row.nm_name,100);
  const local=clean(row.local_input,32), zone=clean(row.source_timezone,60);
  const tod=`<t:${unixSeconds(row.occurred_at_utc)}:F>`;
  const sent=`<t:${unixSeconds(row.created_at_utc)}:F>`;
  if(row.kind==='invalidation') {
    return `🛑 **NisToD — ToD invalidé**\n`+
      `👤 Déclaration initiale : **${who}**${uid}\n`+
      `🎯 NM : **${nm}**\n`+
      `☠️ ToD invalidé : ${tod}\n`+
      `📜 Événement n°${row.event_id} — retiré du suivi actif.\n`+
      (row.invalidated_by_display_name ? `🛡️ Modération : **${clean(row.invalidated_by_display_name)}**` + (row.invalidated_by_discord_id ? ` (<@${row.invalidated_by_discord_id}>)` : '') + `\n` + `📝 Motif : ${clean(row.invalidation_reason||'Non précisé',240)}` : `ℹ️ L’auteur de l’invalidation n’est pas connu lorsque la correction est faite directement dans D1.`);
  }
  const status=row.event_state==='conflict'?'⚠️ **Signalement contradictoire — non appliqué au tableau**':
    row.event_state==='invalidated'?'🛑 **Déclaration depuis invalidée — ne pas utiliser comme ToD**':
    '✅ **ToD enregistré**';
  return `📋 **NisToD — Nouveau signalement**\n`+
    `👤 Déclarant : **${who}**${uid}\n`+
    `🎯 NM : **${nm}**\n`+
    `☠️ Heure de mort déclarée : ${tod}\n`+
    `🕒 Heure saisie : ${local} (${zone})\n`+
    `📥 Date du signalement : ${sent}\n`+
    `${status} · Événement n°${row.event_id}\n`+
    `ℹ️ Le déclarant n’est pas nécessairement celui qui a tué le NM.`;
}

const MAX_ATTEMPTS=5;
const CLAIM_TIMEOUT_MS=10*60*1000;
export async function deliverReportLogs(env, now=Date.now()) {
  if (!/^\d{17,22}$/.test(String(env.REPORTS_CHANNEL_ID||''))) return {skipped:true,reason:'REPORTS_CHANNEL_ID non configuré'};
  if(!env.DISCORD_BOT_TOKEN)return {skipped:true,reason:'Token Discord absent'};
  const before=new Date(now-CLAIM_TIMEOUT_MS).toISOString();
  const rows=await env.DB.prepare(`SELECT r.id AS log_id,r.event_id,r.kind,r.delivery_state,r.attempts,
    e.nm_slug,e.event_type,e.state AS event_state,e.occurred_at_utc,e.source_timezone,
    e.local_input,e.reporter_discord_id,e.reporter_display_name,e.created_at_utc,
    e.invalidated_by_discord_id,e.invalidated_by_display_name,e.invalidation_reason,n.name AS nm_name
    FROM report_log_outbox r JOIN tod_events e ON e.id=r.event_id
    JOIN nm_catalog n ON n.slug=e.nm_slug
    WHERE r.attempts < ? AND (r.delivery_state IN ('pending','failed')
      OR (r.delivery_state='claimed' AND r.last_attempt_at_utc < ?))
    ORDER BY r.id ASC LIMIT 10`).bind(MAX_ATTEMPTS,before).all();
  let delivered=0,failed=0;
  for(const row of rows.results||[]){
    const claim=await env.DB.prepare(`UPDATE report_log_outbox SET delivery_state='claimed',
      attempts=attempts+1,last_attempt_at_utc=? WHERE id=? AND attempts < ? AND (
      delivery_state IN ('pending','failed') OR
      (delivery_state='claimed' AND last_attempt_at_utc < ?))`)
      .bind(new Date(now).toISOString(),row.log_id,MAX_ATTEMPTS,before).run();
    if(!(claim.meta?.changes>0))continue;
    try{
      const sent=await discordApi(env,'POST',`/channels/${env.REPORTS_CHANNEL_ID}/messages`,{
        content:reportMessage(row),allowed_mentions:{parse:[]}
      });
      if(!sent?.id)throw new Error('Discord a répondu sans identifiant de message');
      await env.DB.prepare(`UPDATE report_log_outbox SET delivery_state='delivered',
        delivered_at_utc=?,discord_message_id=?,last_error=NULL WHERE id=? AND delivery_state='claimed'`)
        .bind(new Date().toISOString(),sent.id,row.log_id).run();
      delivered++;
    }catch(e){
      const reason=String(e?.message||e).slice(0,170);
      console.error('NisToD report log error:',row.log_id,reason);
      await env.DB.prepare(`UPDATE report_log_outbox SET delivery_state='failed',last_error=?
        WHERE id=? AND delivery_state='claimed'`).bind(reason,row.log_id).run();
      failed++;
    }
  }
  return {delivered,failed};
}
