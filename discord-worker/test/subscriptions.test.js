import test from 'node:test';
import assert from 'node:assert/strict';
import {LEADS, reminderText, nextReminder} from '../src/subscriptions.js';

test('délais disponibles : 60, 30 et 10 minutes',()=>assert.deepEqual(LEADS,[60,30,10]));
test('heure UTC de rappel 60 minutes avant',()=>assert.equal(nextReminder('2026-11-17T10:30:00Z',60,Date.parse('2026-11-17T08:00:00Z')),'2026-11-17T09:30:00.000Z'));
test('ne programme pas une alerte déjà dépassée',()=>assert.equal(nextReminder('2026-11-17T10:30:00Z',60,Date.parse('2026-11-17T10:00:00Z')),null));
test('MP contient le nom et des timestamps Discord',()=>{const x=reminderText('Simurgh','2026-11-17T10:30:00Z','2026-11-17T11:00:00Z',30);assert.match(x,/Simurgh/);assert.match(x,/30 minutes/);assert.match(x,/<t:\d+:F>/)});
