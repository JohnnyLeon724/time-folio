import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVersion, setVersion } from './release-version.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'timefolio-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, 'docs/releases'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'timefolio', version: '0.1.0' }),
  );
  writeFileSync(
    join(root, 'src-tauri/tauri.conf.json'),
    JSON.stringify({
      version: '0.1.0',
      identifier: 'com.timefolio.desktop',
      productName: 'Timefolio',
    }),
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.toml'),
    '[package]\nname = "timefolio"\nversion = "0.1.0"\n',
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.lock'),
    '[[package]]\nname = "other"\nversion = "0.1.0"\n\n[[package]]\nname = "timefolio"\nversion = "0.1.0"\ndependencies = []\n',
  );
  writeFileSync(join(root, 'docs/releases/v0.1.0.md'), '# Timefolio v0.1.0\nTest release.\n');
  return root;
}

test('accepts matching versions and rejects a tag that does not match', (t) => {
  const root = fixture(t);
  assert.equal(checkVersion(root, 'v0.1.0'), '0.1.0');
  assert.throws(() => checkVersion(root, 'v0.2.0'), /tag/i);
  assert.throws(() => checkVersion(root, '../../file'), /tag/i);
});
test('updates only project versions, requires release notes, and rejects invalid versions', (t) => {
  const root = fixture(t);
  for (const version of ['v1.0.0', '01.0.0', '1.0', '1.0.0-beta.1', '999999.0.0']) {
    assert.throws(() => setVersion(root, version));
  }
  assert.equal(checkVersion(root), '0.1.0');
  setVersion(root, '0.2.0');
  assert.match(
    readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8'),
    /name = "other"\nversion = "0.1.0"/,
  );
  assert.throws(() => checkVersion(root), /notes/i);
  writeFileSync(join(root, 'docs/releases/v0.2.0.md'), '# Timefolio v0.2.0\nNew version.\n');
  assert.equal(checkVersion(root), '0.2.0');
});
test('rejects stale lockfile and accidental acceptance application identity', (t) => {
  const root = fixture(t);
  const lock = join(root, 'src-tauri/Cargo.lock');
  writeFileSync(
    lock,
    readFileSync(lock, 'utf8').replace(
      'name = "timefolio"\nversion = "0.1.0"',
      'name = "timefolio"\nversion = "0.0.9"',
    ),
  );
  assert.throws(() => checkVersion(root), /mismatch/i);
  setVersion(root, '0.1.0');
  const path = join(root, 'src-tauri/tauri.conf.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  config.identifier = 'com.timefolio.acceptance';
  writeFileSync(path, JSON.stringify(config));
  assert.throws(() => checkVersion(root), /identity/i);
});
