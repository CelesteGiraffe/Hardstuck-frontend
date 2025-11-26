#!/usr/bin/env node
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    child_process.exec(cmd, (err, stdout, stderr) => {
      if (err) return reject({ err, stderr, stdout });
      resolve({ stdout, stderr });
    });
  });
}

async function commandExists(command) {
  const check = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  try {
    await execPromise(check);
    return true;
  } catch (_e) {
    return false;
  }
}

function hasNodeModules(dir) {
  return fs.existsSync(path.join(dir, 'node_modules'));
}

async function ensureInstalledIfMissing(dir) {
  if (!fs.existsSync(dir)) return false;
  if (hasNodeModules(dir)) return true;
  return new Promise((resolve, reject) => {
    console.log(`Installing npm deps in ${dir}...`);
    const proc = child_process.spawn('npm', ['install'], { cwd: dir, stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`npm install failed in ${dir} (code ${code})`));
    });
  });
}

function openUrl(url) {
  if (process.platform === 'darwin') return child_process.spawn('open', [url]);
  if (process.platform === 'win32') return child_process.spawn('cmd', ['/c', 'start', '""', url], { shell: true });
  return child_process.spawn('xdg-open', [url]);
}

function startDevServers(rootDir) {
  // root package.json start uses concurrently to spawn api + ui
  const proc = child_process.spawn('npm', ['start'], { cwd: rootDir, stdio: 'inherit', shell: true });
  return proc;
}

async function run(opts = {}) {
  const root = path.resolve(__dirname, '..');
  const apiDir = path.join(root, 'api');
  const uiDir = path.join(root, 'ui');
  const rootDir = root; // the top-level package.json (concurrently lives here)

  // quick checks
  if (!(await commandExists('node'))) {
    console.error('Node runtime not found on PATH. Please install Node.js: https://nodejs.org/');
    process.exit(1);
  }

  if (!(await commandExists('npm'))) {
    console.error('npm not found on PATH. Ensure Node.js (which includes npm) is installed.');
    process.exit(1);
  }

  // Install dependencies if missing
  try {
    // make sure the top-level packages are present too (root may contain dev deps
    // required for `npm start`, like `concurrently`), then check API and UI folders
    await ensureInstalledIfMissing(rootDir);
    await ensureInstalledIfMissing(apiDir);
    await ensureInstalledIfMissing(uiDir);
  } catch (err) {
    console.error('Failed to install dependencies:', err && err.message ? err.message : err);
    process.exit(1);
  }

  // Start servers
  console.log('Starting development servers...');
  const serverProc = startDevServers(root);

  // Give the UI dev server a moment and try to open the browser (can be disabled in tests)
  const uiUrl = opts.uiUrl || 'http://localhost:5173';
  if (!opts.noOpen) {
    setTimeout(() => {
    console.log(`Opening ${uiUrl} in the default browser...`);
    try { openUrl(uiUrl); } catch (_e) { /* ignore */ }
    }, 1500);
  }

  // propagate exit
  process.on('SIGINT', () => serverProc.kill('SIGINT'));
  process.on('SIGTERM', () => serverProc.kill('SIGTERM'));

  return serverProc;
}

// If run directly, execute run(). Export functions for tests.
if (require.main === module) {
  run().catch(err => {
    console.error('dev-start failed:', err);
    process.exit(1);
  });
}

module.exports = { commandExists, hasNodeModules, ensureInstalledIfMissing, openUrl, startDevServers, run };
