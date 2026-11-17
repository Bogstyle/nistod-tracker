import {reminderEventLabel} from './spawn.js';
import {unixSeconds} from './time.js';

export const LEADS = Object.freeze([60, 30, 10]);
export function reminderText(name, startIso, endIso, lead, mode='window') {
  const until = lead===60 ? '1 heure' : `${lead} minutes`;
  return `🔔 **NisToD Tracker — ${name}**\nRappel : **${until} avant ${reminderEventLabel(mode)}**.\nRepère : <t:${unixSeconds(startIso)}:F> (dans <t:${unixSeconds(startIso)}:R>)${mode==='window'||mode==='placeholder'?`\nFin de la fenêtre estimée : <t:${unixSeconds(endIso)}:t>`:''}\nVous recevez ce MP car vous avez activé un rappel personnel pour ce NM.`;
}
export function nextReminder(startIso, leadMinutes, now=Date.now()) {
  const due=Date.parse(startIso)-leadMinutes*60000;
  return Number.isFinite(due)&&due>now ? new Date(due).toISOString() : null;
}
