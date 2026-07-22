#!/usr/bin/env node
// Verifies that submitted payload fields are not merely stored, but visible in
// the human-readable raw/admin formatter. This catches the "Sonja dresscode/DJ
// photos existed but were easy to miss" class of regression.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const backendDir = join(root, 'backend');
const code = readdirSync(backendDir)
  .filter((file) => file.endsWith('.gs'))
  .sort()
  .map((file) => readFileSync(join(backendDir, file), 'utf8'))
  .join('\n');
const contract = JSON.parse(readFileSync(join(root, 'truth', 'submission-field-contract.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

function extractFunctionSource(name) {
  const start = code.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  let depth = 0;
  let seenOpen = false;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') { depth++; seenOpen = true; }
    else if (ch === '}') {
      depth--;
      if (seenOpen && depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error('Could not extract function: ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunctionSource('buildSubmittedPhotoInventoryLines'),
    extractFunctionSource('formatSubmissionEmail'),
  ].join('\n\n'),
  sandbox,
  { filename: 'formatSubmissionEmail.vm.js' }
);

const formatSubmissionEmail = sandbox.formatSubmissionEmail;

function readGolden(name) {
  return JSON.parse(readFileSync(join(here, name + '-golden-payload.json'), 'utf8'));
}

function assertIncludes(label, text, expected) {
  if (text.includes(expected)) ok(label + ' includes "' + expected + '"');
  else bad(label + ' missing "' + expected + '"');
}

function assertContractCoversGolden(formName, golden) {
  const form = contract.forms[formName];
  if (!form) { bad('contract missing form ' + formName); return; }
  const fields = form.fields || {};
  const internal = form.internal || {};
  Object.keys(golden).forEach(function(key) {
    if (fields[key] || internal[key]) ok('contract.' + formName + '.' + key);
    else bad('contract missing ' + formName + '.' + key);
  });
}

console.log('T1 — field contract covers every golden payload key');
const weekly = readGolden('weekly');
const workshop = readGolden('workshop');
const social = readGolden('social');
const festival = readGolden('festival');
assertContractCoversGolden('weekly', weekly);
assertContractCoversGolden('workshop', workshop);
assertContractCoversGolden('social', social);
assertContractCoversGolden('festival', festival);

console.log('\nT2 — readable formatter surfaces golden values with semantic labels');
const weeklyText = formatSubmissionEmail(weekly);
assertIncludes('weekly', weeklyText, 'Dance style');
assertIncludes('weekly', weeklyText, 'ZZ QA kernel description.');
assertIncludes('weekly', weeklyText, 'Open House availability');

const workshopText = formatSubmissionEmail(workshop);
assertIncludes('workshop', workshopText, 'ZZ QA Kernel Workshop');
assertIncludes('workshop', workshopText, 'ZZ QA topic');
assertIncludes('workshop', workshopText, 'Pricing notes');
assertIncludes('workshop', workshopText, 'ZZ QA pricing notes.');

const socialText = formatSubmissionEmail(social);
assertIncludes('social', socialText, 'Dress code / evening theme');
assertIncludes('social', socialText, 'ZZ QA dress');
assertIncludes('social', socialText, 'Genres');
assertIncludes('social', socialText, 'Bachata');
assertIncludes('social', socialText, 'Salsa');
assertIncludes('social', socialText, 'Description');
assertIncludes('social', socialText, 'ZZ QA social description.');
assertIncludes('social', socialText, 'Note for Shoonya');
assertIncludes('social', socialText, 'ZZ QA NOTE FOR SHOONYA.');
assertIncludes('social', socialText, 'ZZ QA other slot description');
assertIncludes('social', socialText, 'Teacher DJ');
assertIncludes('social', socialText, 'ZZ QA Teacher DJ');

const festivalText = formatSubmissionEmail(festival);
assertIncludes('festival', festivalText, 'Co-organiser');
assertIncludes('festival', festivalText, 'ZZ Partner Org');
assertIncludes('festival', festivalText, 'ZZ bio');
assertIncludes('festival', festivalText, 'https://example.com');
assertIncludes('festival', festivalText, 'ZZ dj bio');
assertIncludes('festival', festivalText, 'Separate ticket');
assertIncludes('festival', festivalText, '€15');

console.log('\nT3 — conditional edge payloads stay visible');
const socialRich = JSON.parse(JSON.stringify(social));
socialRich.musicType = 'guest-dj';
socialRich.djName = 'DJ Lokito';
socialRich.djSocials = '@djlokito';
socialRich.djFee = 120;
socialRich.teacherDJ = null;
socialRich.extraDjs = [{ name: 'DJ Sosso', social: '@kikizomba' }];
socialRich.photos = [
  { role: 'dj', label: 'DJ Lokito', b64: 'x', filename: 'DJ Lokito 1.jpeg' },
  { role: 'programme_teacher', label: 'Sonja KikiZomba', b64: 'x', filename: 'sonja-workshop.jpg' }
];
const socialRichText = formatSubmissionEmail(socialRich);
assertIncludes('social rich', socialRichText, 'Dress code / evening theme');
assertIncludes('social rich', socialRichText, 'DJ Lokito');
assertIncludes('social rich', socialRichText, '@djlokito');
assertIncludes('social rich', socialRichText, 'DJ Sosso');
assertIncludes('social rich', socialRichText, '@kikizomba');
assertIncludes('social rich', socialRichText, 'DJ photo');
assertIncludes('social rich', socialRichText, 'DJ Lokito 1.jpeg');
assertIncludes('social rich', socialRichText, 'Programme teacher photo');

const workshopRich = JSON.parse(JSON.stringify(workshop));
workshopRich.host_bio = 'Host bio should be visible.';
workshopRich.video_link = 'https://video.example/workshop';
workshopRich.host_photo_b64 = 'x';
workshopRich.host_photo_name = 'host.jpg';
const workshopRichText = formatSubmissionEmail(workshopRich);
assertIncludes('workshop rich', workshopRichText, 'Host bio');
assertIncludes('workshop rich', workshopRichText, 'Host bio should be visible.');
assertIncludes('workshop rich', workshopRichText, 'Video link');
assertIncludes('workshop rich', workshopRichText, 'https://video.example/workshop');
assertIncludes('workshop rich', workshopRichText, 'Host teacher photo');
assertIncludes('workshop rich', workshopRichText, 'host.jpg');

const festivalRich = JSON.parse(JSON.stringify(festival));
festivalRich.photos = [
  { role: 'banner', label: 'Festival banner', b64: 'x', filename: 'banner.png' },
  { role: 'additional', label: 'Additional image 1', b64: 'x', filename: 'floor.jpg' }
];
const festivalRichText = formatSubmissionEmail(festivalRich);
assertIncludes('festival rich', festivalRichText, 'Banner image');
assertIncludes('festival rich', festivalRichText, 'banner.png');
assertIncludes('festival rich', festivalRichText, 'Additional image');
assertIncludes('festival rich', festivalRichText, 'floor.jpg');

console.log(`\n${fail ? '✗' : '✓'} readable-output contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
