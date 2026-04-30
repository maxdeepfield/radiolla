const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { runGradle } = require('./android-gradle');

const variants = {
  debug: {
    apkPath: ['android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'],
    gradleTask: 'assembleDebug',
    buildIfMissing: true,
  },
  release: {
    apkPath: ['android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'],
    gradleTask: 'assembleRelease',
    buildIfMissing: false,
  },
};

const variant = process.argv[2] || 'debug';
const config = variants[variant];

function runAdb(args, options = {}) {
  const result = spawnSync('adb', args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if (!config) {
  console.error('Usage: node scripts/android-install.js <debug|release>');
  process.exit(1);
}

const apkPath = path.join(__dirname, '..', ...config.apkPath);

if (!fs.existsSync(apkPath)) {
  if (!config.buildIfMissing) {
    console.error(`APK not found at ${apkPath}. Run npm run android:build:${variant} first.`);
    process.exit(1);
  }

  console.log(`APK not found at ${apkPath}. Building ${variant} APK first...`);

  const buildStatus = runGradle([config.gradleTask]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }

  if (!fs.existsSync(apkPath)) {
    console.error(`Build completed but APK is still missing at ${apkPath}.`);
    process.exit(1);
  }
}

if (variant === 'debug') {
  const reverseStatus = runAdb(['reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'pipe' });
  if (reverseStatus !== 0) {
    console.warn('Unable to set adb reverse for Metro. If you are using a physical device, run `adb reverse tcp:8081 tcp:8081` after connecting it.');
  }
}

const installStatus = runAdb(['install', '-r', apkPath]);
if (installStatus !== 0) {
  process.exit(installStatus);
}

if (variant === 'debug') {
  console.log('Debug build installed. Keep Metro running with `npm run android:metro` while the app is open.');
}
