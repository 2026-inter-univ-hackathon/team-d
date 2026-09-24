const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('Firebase web config exposes only the four expected public settings', () => {
  const source = fs.readFileSync(
    path.join(root, 'static/firebase-config.js'),
    'utf8'
  );
  const context = { window: {} };

  vm.runInNewContext(source, context);

  assert.deepEqual(
    Object.keys(context.window.FIREBASE_CONFIG),
    ['apiKey', 'authDomain', 'projectId', 'appId']
  );
  assert.equal(Object.isFrozen(context.window.FIREBASE_CONFIG), true);
  assert.deepEqual(
    Object.keys(context.window.FIREBASE_APP_CHECK_CONFIG),
    ['siteKey']
  );
  assert.equal(Object.isFrozen(context.window.FIREBASE_APP_CHECK_CONFIG), true);
  assert.equal(source.includes('serviceAccount'), false);
  assert.equal(source.includes('private_key'), false);
  assert.equal(source.includes('FIREBASE_APPCHECK_DEBUG_TOKEN'), false);
});

test('Firestore rules restrict every event operation to its authenticated owner', () => {
  const rules = fs.readFileSync(
    path.join(root, 'firebase/firestore.rules'),
    'utf8'
  );

  assert.match(rules, /request\.auth != null/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /match \/users\/\{userId\}\/events\/\{eventId\}/);
  assert.match(rules, /allow read: if isOwner\(userId\)/);
  assert.match(rules, /allow create: if isOwner\(userId\)/);
  assert.match(rules, /allow update: if isOwner\(userId\)/);
  assert.match(rules, /allow delete: if isOwner\(userId\)/);
  assert.match(rules, /request\.resource\.data\.version == resource\.data\.version \+ 1/);
  assert.match(rules, /function isValidDate\(value\)/);
  assert.match(rules, /value\.matches\('\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'\)/);
  assert.match(rules, /function isValidTime\(value\)/);
  assert.match(rules, /value\.matches\('\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'\)/);
  assert.match(rules, /data\.date != null \|\| data\.time == null/);
  assert.match(rules, /isValidDate\(data\.remindedOn\)/);
  assert.match(rules, /hasSameLegacyId\(resource\.data, request\.resource\.data\)/);
});
