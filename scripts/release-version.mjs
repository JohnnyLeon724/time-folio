import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cargoVersion = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const lockVersion = /(^\[\[package\]\]\r?\nname = "timefolio"\r?\nversion = ")([^"]+)(")/m;

function validateVersion(version) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') ||
    version.split('.').some((part) => Number(part) > 65535)
  ) {
    throw new Error('Use a numeric version such as 0.1.0 (each component <= 65535).');
  }
}

function load(root) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const packageText = read('package.json');
  const configText = read('src-tauri/tauri.conf.json');
  const cargoText = read('src-tauri/Cargo.toml');
  const lockText = read('src-tauri/Cargo.lock');
  if (!cargoVersion.test(cargoText) || !lockVersion.test(lockText)) {
    throw new Error('Cannot locate project versions in Cargo files.');
  }
  return {
    packageText,
    configText,
    cargoText,
    lockText,
    pkg: JSON.parse(packageText),
    config: JSON.parse(configText),
  };
}

export function checkVersion(root, tag) {
  const data = load(root);
  const version = data.pkg.version;
  validateVersion(version);
  if (
    [
      data.config.version,
      data.cargoText.match(cargoVersion)[2],
      data.lockText.match(lockVersion)[2],
    ].some((value) => value !== version)
  )
    throw new Error('Project version mismatch. Run pnpm release:version <version>.');
  if (tag !== undefined && tag !== `v${version}`)
    throw new Error(`Release tag must be v${version}.`);
  if (
    data.pkg.name !== 'timefolio' ||
    data.config.identifier !== 'com.timefolio.desktop' ||
    data.config.productName !== 'Timefolio'
  ) {
    throw new Error('Unexpected release application identity.');
  }
  const notes = join(root, `docs/releases/v${version}.md`);
  if (!existsSync(notes) || !readFileSync(notes, 'utf8').includes(`# Timefolio v${version}`)) {
    throw new Error(
      `Missing release notes: docs/releases/v${version}.md (include matching heading).`,
    );
  }
  return version;
}

export function setVersion(root, version) {
  validateVersion(version);
  const data = load(root);
  const replaceJsonVersion = (text) =>
    text.replace(/("version"\s*:\s*")[^"]+("\s*[,}])/, (_, a, b) => `${a}${version}${b}`);
  const files = {
    'package.json': replaceJsonVersion(data.packageText),
    'src-tauri/tauri.conf.json': replaceJsonVersion(data.configText),
    'src-tauri/Cargo.toml': data.cargoText.replace(
      cargoVersion,
      (_, a, _old, b) => `${a}${version}${b}`,
    ),
    'src-tauri/Cargo.lock': data.lockText.replace(
      lockVersion,
      (_, a, _old, b) => `${a}${version}${b}`,
    ),
  };
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, value] = process.argv.slice(2);
    if (operation === 'check') console.log(checkVersion(process.cwd(), value));
    else if (operation === 'set') {
      setVersion(process.cwd(), value);
      console.log(
        `Versions set to ${value}. Add docs/releases/v${value}.md, then run pnpm release:check.`,
      );
    } else throw new Error('Usage: node scripts/release-version.mjs check [vX.Y.Z] | set X.Y.Z');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
