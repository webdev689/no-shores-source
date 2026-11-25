import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAfter, partsOf, versionOf } from './version.ts';

test("a release's version is its commit's UTC time", () => {
  assert.equal(versionOf(new Date('2026-11-25T12:30:45Z')), '2026.1125.1230');
  assert.equal(versionOf(new Date('2026-11-25T14:30:00+02:00')), '2026.1125.1230');
});

test('the first minutes of a year read as plain numbers, as semver has no leading zeros', () => {
  assert.equal(versionOf(new Date('2027-01-01T00:05:00Z')), '2027.101.5');
});

test('every part stays within the 16 bits Windows keeps', () => {
  for (const part of partsOf(versionOf(new Date('2099-12-31T23:59:00Z'))) ?? []) assert.ok(part < 65536);
});

test('versions order by time, part by part, never as text', () => {
  assert.equal(isAfter('2027.101.5', '2026.1231.2359'), true);
  assert.equal(isAfter('2026.1125.1230', '2026.1125.959'), true);
  assert.equal(isAfter('2026.1125.959', '2026.1125.1230'), false);
  assert.equal(isAfter('2026.1125.1230', '2026.1125.1230'), false, 'the same version is never released twice');
  assert.equal(isAfter('2026.1125.1230', null), true);
  assert.equal(isAfter('2026.1125.1230', 'not a version'), true);
  assert.equal(isAfter('not a version', null), false);
});

test('a commit time that does not read is refused', () => {
  assert.throws(() => versionOf(new Date('')));
});
