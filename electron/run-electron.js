const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const waitOn = require('wait-on');

const expoInfoPath = path.join(
  __dirname,
  '..',
  '.expo',
  'dev-server-info.json'
);
const requestedUrl = process.env.EXPO_WEB_URL;
const requestedPort = process.env.EXPO_WEB_PORT || process.env.WEB_PORT;
const electronBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
);
const log = msg => console.log(`[electron-dev] ${msg}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readUrlFromExpoInfo = () => {
  try {
    const raw = fs.readFileSync(expoInfoPath, 'utf8');
    const info = JSON.parse(raw);
    const host = info.webpackServerHost || info.host || 'localhost';
    const port =
      info.webpackServerPort ??
      info.expoServerPort ??
      info.port ??
      info.packagerPort;
    if (!port) return null;
    const protocol = info.https ? 'https' : 'http';
    return `${protocol}://${host}:${port}`;
  } catch {
    return null;
  }
};

const waitForUrl = (url, timeoutMs = 45000) =>
  new Promise((resolve, reject) => {
    waitOn(
      {
        resources: [url],
        timeout: timeoutMs,
      },
      err => {
        if (err) return reject(err);
        return resolve(url);
      }
    );
  });

const resolveTargetUrl = async () => {
  // If explicitly provided, honor it and do not try other ports.
  if (requestedUrl) {
    log(`Using EXPO_WEB_URL=${requestedUrl}`);
    return requestedUrl;
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (url, reason) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, reason });
  };

  const addPortCandidates = (port, reason) => {
    addCandidate(`http://localhost:${port}`, reason);
    addCandidate(`http://127.0.0.1:${port}`, reason);
  };

  if (requestedPort) {
    addPortCandidates(requestedPort, 'EXPO_WEB_PORT/WEB_PORT');
  }

  const maybeAddExpoInfo = () => {
    const inferred = readUrlFromExpoInfo();
    if (inferred) addCandidate(inferred, '.expo/dev-server-info.json');
  };

  maybeAddExpoInfo();
  addPortCandidates(8081, 'default');
  addPortCandidates(8082, 'default');

  const deadline = Date.now() + 45000;
  let lastError;

  while (Date.now() < deadline) {
    // Pick up dev-server-info.json if it appears later.
    maybeAddExpoInfo();

    for (const { url, reason } of candidates) {
      try {
        await waitForUrl(url, 3000);
        log(`Using ${url} (${reason})`);
        return url;
      } catch (err) {
        lastError = err;
      }
    }

    await sleep(500);
  }

  throw new Error(
    `Expo web dev server not reachable. Tried: ${Array.from(seen).join(', ')}${
      lastError ? ` (${lastError.message})` : ''
    }`
  );
};

const spawnElectron = url => {
  const mainPath = path.join(__dirname, 'main.js');
  const env = { ...process.env, EXPO_WEB_URL: url };
  // Ensure we don't accidentally inherit Electron's "run as node" flag from the shell.
  delete env.ELECTRON_RUN_AS_NODE;
  return spawn(electronBin, [mainPath], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
};

(async () => {
  try {
    const targetUrl = await resolveTargetUrl();
    await waitForUrl(targetUrl);

    log(`Starting Electron pointed at ${targetUrl}`);
    const child = spawnElectron(targetUrl);

    child.on('exit', code => {
      log(`Electron exited with code ${code ?? 0}`);
    });
  } catch (err) {
    console.error('[electron-dev] Failed to start Electron:', err.message);
    console.error(
      '[electron-dev] Ensure "expo start --web" is running. Set EXPO_WEB_URL or EXPO_WEB_PORT to force a specific dev URL if needed.'
    );
    process.exit(1);
  }
})();
