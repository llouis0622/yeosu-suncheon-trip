const assert = require('node:assert/strict');
const E = require('./engine');
const r = require('./data.json')[0];
const defaults = E.createPlan(r);
const base = E.schedule(r, defaults);
let scenarios = 0;
const point = id => r.points.find(p => p.id === id);
const clone = value => JSON.parse(JSON.stringify(value));
function validate(p) {
  const original = clone(p);
  const result = E.schedule(r, p); scenarios++;
  result.days.forEach((day, index) => {
    let end = 0;
    for (const b of day.blocks) {
      assert(Number.isFinite(b.start) && Number.isFinite(b.end));
      assert(b.start >= end && b.end >= b.start, 'chronological, non-overlapping blocks');
      end = b.end;
    }
    const visits = day.blocks.filter(b => b.uid);
    const fixed = r.itinerary.days[index].filter(b => ['visit', 'slot'].includes(b.kind));
    assert.deepEqual(visits.map(b => b.uid), fixed.map(b => b.id), 'fixed order');
    visits.forEach((b, i) => assert.equal(b.end - b.start, fixed[i].duration, 'dwell time preserved'));
    const steps = result.steps.filter(s => s.day === index);
    const pairs = steps.slice(1).flatMap((s, i) => steps[i].poi === s.poi ? [] : [[steps[i].poi, s.poi]]);
    assert.deepEqual(result.edges.filter(e => e.day === index).map(e => [e.from,e.to]), pairs, 'map follows actual stops only');
    for (const edge of result.edges.filter(e => e.day === index)) {
      assert(point(edge.from) && point(edge.to));
      assert(edge.minutes > 0 && edge.minutes % 10 === 0);
    }
  });
  assert.deepEqual(p, original, 'schedule does not mutate choices');
  return result;
}
validate(defaults);
assert.equal(base.unselected.length, 8);
assert.equal(base.hotel, 'ys_stay_shilla');
assert.equal(base.days[0].blocks[0].start, 450);
assert(base.steps.some(b => b.poi === 'busan_pickup' && b.day === 0 && b.start === 480));
assert.equal(base.transferDeparture, 1040);
assert.equal(base.returnDeparture, 810);
assert.equal(base.pickupReturnMinute, 1000);
assert.equal(base.returnMinute, 1030);
assert(base.edges.some(e => e.from === 'sc_tteok' && e.to === 'sc_garden'));
assert(base.edges.some(e => e.from === 'ys_odongdo' && e.to === 'busan_pickup'));
assert(base.days.slice(1).every(d => d.blocks.find(b => b.slotId?.endsWith('breakfast')).start === 510));
assert(!r.courses, 'single route has no alternatives');
assert.equal(r.points.filter(p => p.type === 'hotel').length, 8);
assert(r.points.filter(p => p.type === 'hotel').every(p => p.city === '여수'));
assert.equal(new Set(r.points.map(p => p.id)).size, r.points.length);

// Every offered choice must produce a coherent schedule, including outlying cafes.
for (const s of E.slots(r)) for (const p of r.points.filter(p => E.eligible(r, s.id, p))) {
  const plan = clone(defaults); plan.choices[s.id] = p.id;
  const res = validate(plan);
  assert.equal(res.days[s.day].blocks.find(b => b.slotId === s.id).poi, p.id);
  assert(res.edges.some(e => e.day === s.day && e.to === p.id));
  assert.equal(res.unselected.length, 7);
}
for (const hotel of r.points.filter(p => p.type === 'hotel')) {
  const p = clone(defaults); p.hotel = hotel.id;
  const result = validate(p);
  assert(result.days.every(d => d.blocks.some(b => b.kind === 'hotel' && b.poi === hotel.id)));
  assert(result.steps.filter(s => point(s.poi).type === 'hotel').every(s => s.poi === hotel.id));
}
const p = clone(defaults);
p.choices['d0-lunch'] = 'sc_nanulteo';
assert(point(p.choices['d0-lunch']), 'known lunch candidate');
let result = validate(p);
assert(!result.edges.some(e => e.from === 'sc_tteok' && e.to === 'sc_garden'));
assert(result.edges.some(e => e.from === 'sc_tteok' && e.to === 'sc_nanulteo'));
assert(result.edges.some(e => e.from === 'sc_nanulteo' && e.to === 'sc_garden'));
p.choices['d0-lunch'] = 'sc_gunbong'; result = validate(p);
assert(!result.edges.some(e => e.to === 'sc_nanulteo'));
p.choices['d0-lunch'] = null;
assert.deepEqual(validate(p), base, 'clearing choice restores exact baseline route/times');
p.choices['d2-break'] = 'ys_goso'; result = validate(p);
assert(result.edges.some(e => e.from === 'ys_odongdo' && e.to === 'ys_goso'));
p.choices['d2-break'] = 'ys_moifin'; result = validate(p);
assert(!result.steps.some(s => s.poi === 'ys_goso'), 'cafe replaces mural village');
assert(result.returnDeparture > 810 && result.warnings.some(w => w.includes('13:30')));

// Opening waits never silently trim the user's museum visits.
const fixture = clone(r);
fixture.points.find(p => p.id === 'ys_deokchung').hours = {open: 780, close: 1200};
const late = E.createPlan(fixture); late.choices['d1-lunch'] = 'ys_deokchung';
const lateResult = E.schedule(fixture, late);
assert(lateResult.days[1].blocks.some(b => b.kind === 'wait' && b.title.includes('개장')));
assert.equal(lateResult.days[1].blocks.find(b => b.poi === 'ys_arte' && b.kind === 'visit').duration, 90);
assert(lateResult.warnings.some(w => w.includes('아르떼') && w.includes('마감')));
fixture.points.find(p => p.id === 'ys_deokchung').hours.closedDays = [0];
assert(E.schedule(fixture, late).warnings.some(w => w.includes('휴무')));

const invalid = clone(defaults);
invalid.hotel = 'sc_garden';
invalid.choices['d0-lunch'] = 'ys_deokchung';
invalid.choices['d2-break'] = 'ys_aquaplanet';
invalid.choices['unknown'] = 'ys_goso';
invalid.days = [{duration: 1}];
assert.deepEqual(E.normalizePlan(r, invalid), defaults);
for (const value of [null, {}, {version: 1}, {...defaults, choices: []}]) assert.throws(() => E.normalizePlan(r, value));
assert(!E.eligible(r, 'd0-lunch', point('sc_tteok')));
console.log(`${scenarios} schedule scenarios passed: all choices, fixed durations, route insertion/removal, hotels, opening waits, return targets, import validation.`);
