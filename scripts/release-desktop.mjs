#!/usr/bin/env node
/**
 * Release Desktop (Admin Master)
 * - Sync versions
 * - Build Tauri installer
 * - Copy MSI to ./release/<version>
 * - Optionally create signed offline update package (.zip)
 *
 * Usage:
 *   npm run release:desktop
 *   npm run release:desktop -- --skip-build
 *   npm run release:desktop -- --no-update
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import crypto from 'crypto';

function readText(p) { return fs.readFileSync(p, 'utf8'); }

function getAppVersion() {
  const appTs = readText(path.join(process.cwd(), 'src', 'config', 'app.ts'));
  const m = appTs.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return (m?.[1] || '0.0.0').trim();
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

function findNewestMsi() {
  const base = path.join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle', 'msi');
  if (!fs.existsSync(base)) return null;
  const files = fs.readdirSync(base).filter(f => f.toLowerCase().endsWith('.msi'));
  if (!files.length) return null;
  let newest = null;
  let newestTime = 0;
  for (const f of files) {
    const p = path.join(base, f);
    const st = fs.statSync(p);
    if (st.mtimeMs > newestTime) { newestTime = st.mtimeMs; newest = p; }
  }
  return newest;
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const noUpdate = args.includes('--no-update');

run('node', ['scripts/sync-tauri-version.mjs']);

if (!skipBuild) {
  run('npm', ['run', 'tauri:build']);
}

const version = getAppVersion();
const msi = findNewestMsi();
if (!msi) {
  console.error('❌ MSI não encontrado em src-tauri/target/release/bundle/msi/');
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'release', version);
fs.mkdirSync(outDir, { recursive: true });

const outMsiName = `SmartTechPDV_ADMIN_${version}.msi`;
const outMsi = path.join(outDir, outMsiName);
fs.copyFileSync(msi, outMsi);

const sum = sha256File(outMsi);
fs.writeFileSync(path.join(outDir, 'SHA256.txt'), `${sum}  ${outMsiName}\n`, 'utf8');

let updateZipName = '';
if (!noUpdate) {
  updateZipName = `update-${version}.zip`;
  const updateZipPath = path.join(outDir, updateZipName);
  // note: usa a chave privada em tools/license/.keys/private.pem
  run('npm', ['run', 'update:package', '--', '--file', outMsi, '--version', version, '--note', `Atualização ${version}`, '--out', updateZipPath]);
}

fs.writeFileSync(path.join(outDir, 'LEIA-ME.txt'),
`SMART TECH PDV (ADMIN MASTER) - RELEASE DESKTOP\n\nVersão: ${version}\n\nArquivos:\n- ${outMsiName}\n${updateZipName ? `- ${updateZipName} (pacote de atualização offline assinado)\n` : ''}\n\nComandos úteis:\n- Gerar chaves: node tools/license/keygen.mjs --mode prod\n- Gerar licença: node tools/license/generate-token.mjs --device \"<MACHINE_ID>\" --days 365 --out \"cliente.lic\"\n\nChecksum:\n${sum}\n`,
'utf8'
);

console.log('\n✅ Release gerada em:', outDir);
console.log('📦 Instalador:', outMsiName);
if (updateZipName) console.log('📦 Pacote update:', updateZipName);
