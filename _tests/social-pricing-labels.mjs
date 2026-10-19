// Real form collector, isolated from DOM/network: no submissions or mail.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file = new URL('../smart-form/social-nights.html', import.meta.url);
const html = fs.readFileSync(file, 'utf8');
const normaliser = html.slice(html.indexOf('function _ssNormalisePricingLabel('), html.indexOf('// Collect the pricing tiers'));
const collector = html.slice(html.indexOf('function _ssCollectPricing('), html.indexOf('// Collect extra-DJ text rows'));
let rows = [];
const ctx = vm.createContext({ document: { querySelectorAll: () => rows.map(([label, price]) => ({ querySelectorAll: () => [{ value: label }, { value: price }] })) } });
vm.runInContext(normaliser + collector, ctx);
const collect = () => JSON.parse(JSON.stringify(vm.runInContext('_ssCollectPricing()', ctx)));
rows = [['Workshop + party Advance', '15'], ['Workshop + party Door', '17'], ['Only party advance', '8'], ['Only party door', '10'], ['', '']];
assert.deepEqual(collect(), [
  { label: 'Advance Workshop + Party', price: 15 }, { label: 'Door Workshop + Party', price: 17 },
  { label: 'Advance Party only', price: 8 }, { label: 'Door Party only', price: 10 },
]);
for (const label of ['Advance', 'Door', 'Advance Workshop + Party', 'Members Advance', 'Early bird Advance', 'Student Advance', 'Workshop + party Advance Door']) {
  rows = [[label, '12']];
  assert.equal(collect()[0].label, label, 'must not reinterpret ' + label);
}
rows = [['  WORKSHOP & PARTY door.  ', '17'], ['Party only ADVANCE', '8']];
assert.deepEqual(collect(), [{ label: 'Door Workshop + Party', price: 17 }, { label: 'Advance Party only', price: 8 }]);
// Parse every inline script after the edit, without executing page/network code.
for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script);
console.log('PASS: exact Lisbeth labels, prefix compatibility, protected/unknown labels, whitespace, punctuation, blank rows, inline-script syntax');
