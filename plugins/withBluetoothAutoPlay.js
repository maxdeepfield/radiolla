const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

const PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
];

function addPermission(androidManifest, permission) {
  const permissions = androidManifest.manifest['uses-permission'] ?? [];
  const exists = permissions.some(
    item => item?.$?.['android:name'] === permission
  );

  if (!exists) {
    permissions.push({ $: { 'android:name': permission } });
    androidManifest.manifest['uses-permission'] = permissions;
  }
}

function copyKotlinSources(platformProjectRoot) {
  const sourceDir = path.join(__dirname, 'bluetooth-auto-play');
  const targetDir = path.join(
    platformProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'absolutefreakout',
    'radiolla'
  );

  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of [
    'BluetoothAutoPlayModule.kt',
    'BluetoothAutoPlayPackage.kt',
  ]) {
    fs.copyFileSync(
      path.join(sourceDir, fileName),
      path.join(targetDir, fileName)
    );
  }
}

module.exports = function withBluetoothAutoPlay(config) {
  config = withAndroidManifest(config, config => {
    for (const permission of PERMISSIONS) {
      addPermission(config.modResults, permission);
    }
    return config;
  });

  config = withMainApplication(config, config => {
    const packageLine = '              add(BluetoothAutoPlayPackage())';
    if (!config.modResults.contents.includes('BluetoothAutoPlayPackage()')) {
      config.modResults.contents = config.modResults.contents.replace(
        '              // add(MyReactNativePackage())',
        `              // add(MyReactNativePackage())\n${packageLine}`
      );
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    config => {
      copyKotlinSources(config.modRequest.platformProjectRoot);
      return config;
    },
  ]);

  return config;
};
