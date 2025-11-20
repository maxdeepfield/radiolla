const path = require('path');
const { spawn } = require('child_process');
const waitOn = require('wait-on');

const targetUrl = process.env.EXPO_WEB_URL || 'http://localhost:8081';
const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const log = (msg) => console.log(`[electron-dev] ${msg}`);

const spawnElectron = () => {
  const mainPath = path.join(__dirname, 'main.js');
  const env = { ...process.env, EXPO_WEB_URL: targetUrl };
  return spawn(electronBin, [mainPath], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
};

waitOn(
  {
    resources: [targetUrl],
    timeout: 30000,
  },
  (err) => {
    if (err) {
      console.error('[electron-dev] wait-on failed:', err.message);
      process.exit(1);
    }

    log(`Starting Electron pointed at ${targetUrl}`);
    const child = spawnElectron();

    child.on('exit', (code) => {
      log(`Electron exited with code ${code ?? 0}`);
    });
  },
);
