/**
 * Create NSIS installer from packaged Electron app
 * Reads all config from package.json
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Get config from package.json
const appName = pkg.build?.productName || pkg.name || 'App';
const appId = pkg.build?.appId || `com.${pkg.name}.app`;
const version = pkg.version || '1.0.0';
const icon = pkg.build?.win?.icon || 'assets/icon.ico';
const originalMain = pkg.main;

const buildDir = `build/${appName}-win32-x64`;

// Check if build exists
if (!fs.existsSync(buildDir)) {
  console.error(`❌ Build not found at ${buildDir}`);
  console.error('Run "node scripts/build-electron.js" first');
  process.exit(1);
}

console.log(`Creating installer for ${appName} v${version}...`);

// Temporarily update main for electron-builder
pkg.main = 'electron/main.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

try {
  console.log('\n📦 Creating NSIS installer...');
  const builderCmd = [
    'npx electron-builder --win nsis',
    `--prepackaged "${buildDir}"`,
    `--config.productName="${appName}"`,
    `--config.appId=${appId}`,
    '--config.directories.output=installer',
    '--config.nsis.oneClick=false',
    '--config.nsis.allowToChangeInstallationDirectory=true',
    `--config.win.icon=${icon}`,
  ].join(' ');

  execSync(builderCmd, { stdio: 'inherit' });
  console.log(`\n✅ Installer created in installer/`);
  console.log(`   ${appName} Setup ${version}.exe`);
} finally {
  // Restore original main
  pkg.main = originalMain;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('✓ Restored main to', originalMain);
}
