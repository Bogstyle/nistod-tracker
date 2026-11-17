import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReport, localToUtc,addMinutes,formatInZone} from '../src/time.js';
test('ToD Simurgh Paris en novembre -> UTC -> fenêtre 21h',()=>{
  const d=parseReport('Simurgh, 16/11/26 11:30','Europe/Paris');
  assert.equal(d.utc,'2026-11-16T10:30:00.000Z');
  assert.equal(formatInZone(addMinutes(d.utc,1260),'Europe/Paris'),'17/11/2026 08:30');
  assert.equal(formatInZone(addMinutes(d.utc,1290),'Europe/Paris'),'17/11/2026 09:00');
});
test('Date impossible refusée',()=>assert.throws(()=>parseReport('Simurgh, 31/02/26 11:30','Europe/Paris')));
test('Passage été : heure inexistante rejetée',()=>assert.throws(()=>localToUtc(2026,3,29,2,30,'Europe/Paris'),/existe pas/));
test('Passage hiver : heure ambiguë rejetée',()=>assert.throws(()=>localToUtc(2026,10,25,2,30,'Europe/Paris'),/ambiguë/));
test('Fuseau invalide rejeté',()=>assert.throws(()=>parseReport('Simurgh, 16/11/26 11:30','Mars/Phobos'),/Fuseau/));
test('Date et fuseau Montréal',()=>assert.equal(parseReport('Simurgh, 16/11/26 11:30','America/Montreal').utc,'2026-11-16T16:30:00.000Z'));
test('Saisie incorrecte refusée',()=>assert.throws(()=>parseReport('Simurgh 16/11/26 11:30','Europe/Paris'),/Format/));
