# Radiolla

[![Expo](https://img.shields.io/badge/Expo-54-black.svg?logo=expo&logoColor=white)](#)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-0088cc.svg?logo=react&logoColor=white)](#)
[![Electron](https://img.shields.io/badge/Electron-39-2e2e2e.svg?logo=electron&logoColor=9feaf9)](#)
[![License](https://img.shields.io/badge/License-Private-red.svg)](#)

Hipster-friendly radio manager built with Expo + Electron. Add custom streams, play/pause, and get lightweight playback notifications across desktop, mobile, and web.

---

## Features

- Save and manage custom stream URLs with inline validation.
- Play/stop with now-playing status and optional notifications.
- Dark, minimal UI tuned for touch and desktop.
- Electron wrapper loads the exported web bundle locally for offline-friendly packaging.
- Android media notification shows Now Playing with a Stop action button.
- Windows Electron build minimizes to the tray with Show/Quit controls.

## Tech Stack

- Expo + React Native Web
- Electron for desktop shell
- TypeScript throughout
- expo-av for audio playback
- AsyncStorage for simple persistence

## Quickstart

```bash
npm install
```

### Does it run in Expo Go?

- Yes. The app uses Expo-managed modules included in Expo Go (expo-av, expo-notifications, AsyncStorage, status-bar).
- Audio plays in foreground and can keep playing in background, subject to OS power policies.
- Only local notifications are used; remote push is not configured.

### Development (web or devices)

- Web: `npm run web`
- Android: `npm run android`
- iOS (on macOS): `npm run ios`

### Electron (dev)

Starts Expo web in dev mode and launches Electron against it:

```bash
npm run electron
```

### Build the web bundle

Outputs to `dist/` (consumed by Electron packaging):

```bash
npm run web:export
```

### Electron package (local)

Bundles the web export and runs Electron in production mode:

```bash
npm run electron:pack
```

### Electron installer (Windows)

Builds the NSIS installer into `release/`:

```bash
npm run electron:build
```

## Local Android APK (no EAS)

Build an APK locally with the native Android toolchain:

```bash
npm install
npx expo prebuild --platform android      # generates android/ (managed -> bare)
cd android
./gradlew assembleRelease                 # Windows: .\gradlew assembleRelease
```

Find the APK at `android/app/build/outputs/apk/release/app-release.apk`. Install with `adb install -r app-release.apk`. For a signed release, create a keystore and update the signing config in `android/app/build.gradle`.

### Android media notification

- When audio is playing on Android, a sticky "Now playing" notification appears with a Stop button.
- Tapping Stop halts playback and clears the notification. Requires notification permission.

## How the Electron shell works

- Dev: points Electron to `EXPO_WEB_URL` (the Expo web dev server started by the `electron` script).
- Prod: serves the static export (`dist/` or `web-build/`) via an in-process HTTP server so absolute paths like `/_expo/static/js/...` resolve when loaded from file.
- External links open in the default browser via `shell.openExternal`.
- On Windows, minimizing hides the window to the tray; click the tray icon to restore, or use the tray menu to Show/Quit.

## Folder map

- `App.tsx` - UI and playback logic.
- `index.ts` - Expo entrypoint.
- `electron/main.js` - Electron bootstrap and static server.
- `electron/run-electron.js` - Dev helper to wait for Expo web then start Electron.
- `dist/` - Expo web export (created by `web:export`).
- `release/` - Build artifacts (created by `electron:build`).

## Troubleshooting

- Blank window or `ERR_FILE_NOT_FOUND` for `/_expo/...`: run `npm run web:export` before packaging so `dist/` exists; the Electron static server will serve those assets.
- No audio: verify the stream URL works in a browser and starts with http or https.
- Notifications not showing: grant notification permission when prompted; on Android ensure the Playback channel exists.
- Dev server not ready: when running `npm run electron`, Expo must finish starting; the wait-on step times out after 30s if it cannot reach the dev URL.

## Scripts reference

- `npm run start` - Expo start (choose platform in CLI).
- `npm run web` - Expo web dev server.
- `npm run electron` - Expo web dev + Electron dev.
- `npm run web:export` - Static web export to `dist/`.
- `npm run electron:pack` - Bundle export + run Electron in production mode.
- `npm run electron:build` - Build Windows installer to `release/`.

## Requirements

- Node.js 18+ recommended.
- Expo CLI (installed via `npm install` above).
- For signing and packaging (optional): platform-specific tooling if you add code signing.

---

Built for folks who keep too many radio tabs open. Enjoy.
