/**
 * Build Electron app for distribution
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
const icon = pkg.build?.win?.icon || 'assets/icon.ico';
const originalMain = pkg.main;

console.log(`Building ${appName}...`);

// Step 1: Export web build
console.log('\n📦 Exporting web build...');
execSync('npx expo export --platform web --output-dir dist', { stdio: 'inherit' });

// Step 2: Fix absolute paths in index.html for Electron file:// protocol
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
  html = html.replace(/href="\/_expo\//g, 'href="./_expo/');
  fs.writeFileSync(indexPath, html);
  console.log('✓ Fixed paths in index.html');
}

// Step 3: Temporarily update main for electron packager
pkg.main = 'electron/main.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('✓ Updated main to electron/main.js');

try {
  // Step 4: Package with electron-packager
  console.log('\n🔨 Packaging Electron app...');
  const packagerCmd = [
    'npx @electron/packager .',
    `"${appName}"`,
    '--platform=win32',
    '--arch=x64',
    '--out=build',
    '--overwrite',
    `--icon=${icon}`,
    '--ignore="^/build"',
    '--ignore="^/release"',
    '--ignore="^/installer"',
    '--ignore="^/android"',
    '--ignore="^/ios"',
    '--ignore="^/\\.git"',
    '--ignore="^/\\.expo"',
    '--ignore="^/\\.history"',
    '--ignore="^/node_modules/\\.cache"',
  ].join(' ');

  execSync(packagerCmd, { stdio: 'inherit' });
  console.log(`\n✅ Build complete! Output: build/${appName}-win32-x64`);
} finally {
  // Restore original main
  pkg.main = originalMain;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('✓ Restored main to', originalMain);
}
