// Dates civiles -> instants UTC, sans supposer le fuseau local du Worker.
export function validTimeZone(zone) {
  if (!zone || typeof zone !== 'string') return false;
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: zone }).format(new Date()); return true; }
  catch { return false; }
}

function zonedFields(milliseconds, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(milliseconds))
    .filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return p;
}
function offsetAt(utcMilliseconds, zone) {
  const f = zonedFields(utcMilliseconds, zone);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute) - utcMilliseconds;
}

// Le changement d'heure peut rendre une heure inexistante ou ambiguë.
// Énumérer les offsets autour du jour considéré permet de détecter ces cas.
export function localToUtc(year, month, day, hour, minute, zone) {
  if (!validTimeZone(zone)) throw new Error('Fuseau inconnu : indique par exemple Europe/Paris.');
  const civil = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (civil.getUTCFullYear() !== year || civil.getUTCMonth() + 1 !== month ||
      civil.getUTCDate() !== day || civil.getUTCHours() !== hour ||
      civil.getUTCMinutes() !== minute) throw new Error('Date ou heure impossible.');
  const intended = [year, month, day, hour, minute];
  const assumed = civil.getTime();
  const offsets = new Set([-86400000, 0, 86400000].map(d => offsetAt(assumed + d, zone)));
  const matches = [...offsets].map(offset => assumed - offset).filter(ms => {
    const v = zonedFields(ms, zone);
    return [v.year, v.month, v.day, v.hour, v.minute].every((n,i) => n === intended[i]);
  });
  if (matches.length === 0) throw new Error('Cette heure locale n’existe pas (changement d’heure).');
  if (matches.length > 1) throw new Error('Heure ambiguë (changement d’heure) : préciser le ToD en UTC.');
  return new Date(matches[0]).toISOString();
}

export function parseReport(input, zone) {
  const match = /^\s*([^,]{2,80})\s*,\s*(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s*$/.exec(input || '');
  if (!match) throw new Error('Format : Nom du NM, JJ/MM/AA HH:MM (ex. Simurgh, 16/11/26 11:30).');
  const [, name, dd, mm, yy, hh, minute] = match;
  const year = 2000 + Number(yy), month = Number(mm), day = Number(dd);
  const hour = Number(hh), min = Number(minute);
  if (hour > 23 || min > 59) throw new Error('Heure invalide.');
  return {name: name.trim(), utc: localToUtc(year, month, day, hour, min, zone),
    submittedLocal: `${dd}/${mm}/${yy} ${hh}:${minute}`};
}

export function formatInZone(iso, zone) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: zone, day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).format(new Date(iso));
}
export function unixSeconds(iso) { return Math.floor(Date.parse(iso) / 1000); }
export function addMinutes(iso, min) { return new Date(Date.parse(iso) + min * 60000).toISOString(); }
