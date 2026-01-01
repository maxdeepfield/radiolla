# Radiolla

[![Expo](https://img.shields.io/badge/Expo-54-black.svg?logo=expo&logoColor=white)](#)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-0088cc.svg?logo=react&logoColor=white)](#)
[![Electron](https://img.shields.io/badge/Electron-39-2e2e2e.svg?logo=electron&logoColor=9feaf9)](#)
[![License](https://img.shields.io/badge/License-Private-red.svg)](#)

Radiolla is a cross-platform radio streaming application designed for managing and playing custom internet radio streams. It allows users to add, edit, and remove radio stations by URL, control playback (play/stop), and receive lightweight notifications. The app emphasizes a "hipster-friendly" dark, minimal UI optimized for touch and desktop, with features like theme switching (light/dark/auto) and background playback. It supports desktop (via Electron), mobile (Android/iOS), and web platforms, enabling offline-friendly packaging for desktop use.

Optionally, users can sign in with Google to sync their station list to Firebase Firestore; everything continues to work locally without signing in.

---

## Features

- **Custom Stream Management**: Add, edit, and remove radio stations by URL with inline validation.
- **Playback Control**: Play/stop audio with now-playing status tracking and error handling.
- **Notifications**: Lightweight local notifications, including Android media notifications with a "Stop" action.
- **User Interface**: Dark, minimal UI optimized for touch and desktop, with theme switching (light/dark/auto).
- **Cross-Platform Support**: Desktop (Electron), mobile (Android/iOS), and web platforms.
- **Background Playback**: Audio continues playing in the background, subject to OS policies.
- **Persistence**: User-added stations and theme preferences stored using AsyncStorage; optional cloud sync via Google Sign-In + Firestore.
- **Offline Packaging**: Electron provides offline-friendly desktop packaging.

## Technologies Used

- **Expo and React Native**: Core framework for cross-platform development, including React Native Web for web support.
- **Electron**: Desktop shell for Windows, loading the Expo web export locally with tray minimization and NSIS installer.
- **TypeScript**: Used throughout for type safety.
- **expo-av**: Handles audio playback with background support and interruption handling.
- **expo-notifications**: Manages local notifications, including Android media notifications.
- **Firebase Auth + Firestore**: Google Sign-In (web and native) and cloud storage for station sync.
- **AsyncStorage**: Simple key-value persistence for stations and preferences.
- **React Native Components**: FlatList, Modal, TextInput, etc., for UI.
- **Additional Libraries**: Roboto Condensed fonts via @expo-google-fonts, concurrently for running multiple processes, cross-env for environment variables, electron-builder for packaging, and wait-on for dev setup.

## Installation

### Prerequisites

- Node.js 18+ recommended.
- Expo CLI (installed via `npm install`).
- For Android development: Android Studio or native toolchain.
- For iOS development: macOS with Xcode.
- For Electron: Windows (for building installer).

### Install Dependencies

```bash
npm install
```

### Firebase/Google setup (for cloud sync)

Cloud sync is optional. If you skip this section, the app stays in "Local only" mode.

1. Create a Firebase project and enable **Authentication > Google** and **Firestore**.
2. Add platform apps in Firebase and download configs:
   - Web: use the Firebase web config object.
   - Android: download `google-services.json` into `android/app/google-services.json`.
   - iOS: download `GoogleService-Info.plist` into `ios/GoogleService-Info.plist` after `expo prebuild`.
3. Provide credentials to the app either via environment variables or by editing `services/firebase.config.ts`:
   - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID` (optional).
   - Google OAuth client IDs: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`.
4. On Android, ensure SHA-1 is added in Firebase settings; on web, add your dev/prod domains to authorized domains.

## Usage

### Running in Expo Go

The app uses Expo-managed modules included in Expo Go (expo-av, expo-notifications, AsyncStorage, status-bar). Audio plays in foreground and can continue in background, subject to OS power policies. Only local notifications are used; remote push is not configured.

### Development

- **Web**: `npm run web` - Starts Expo web dev server.
- **Android**: `npm run android` - Runs on Android device/emulator.
- **iOS**: `npm run ios` - Runs on iOS simulator/device (macOS only).
- **Electron (Dev)**: `npm run electron` - Starts Expo web in dev mode and launches Electron against it.

### Adding and Managing Stations

1. Open the app.
2. Tap "Add Station" to enter a stream URL (must start with http/https).
3. Validate and save the station.
4. Select a station to play/stop.
5. Use the theme switcher for light/dark/auto modes.

### Cloud Sync (optional)

- Open **Menu > Settings > Cloud Sync** and tap **Sign in with Google**.
- On first sign-in, local and cloud stations are merged by URL (local wins ties) and uploaded.
- Add/edit/delete actions sync automatically while online; changes queue locally when offline and replay when the network returns.
- The status pill shows `Local only`, `Syncing...`, `Synced`, `Offline`, or `Sync failed` (with Retry).
- Sign out at any time to return to local-only mode; local stations remain on device.

### Notifications

- Grant notification permission when prompted.
- On Android, a sticky "Now Playing" notification appears with a Stop button.
- Notifications are local and lightweight.

## Building and Deployment

### Web Bundle Export

Outputs to `dist/` (consumed by Electron):

```bash
npm run web:export
```

### Electron Packaging

Bundles the web export and runs Electron in production mode:

```bash
npm run electron:pack
```

### Electron Installer (Windows)

Builds the NSIS installer into `release/`:

```bash
npm run electron:build
```

### Local Android APK

Build an APK locally (no EAS required):

```bash
npm install
npx expo prebuild --platform android  # Generates android/ (managed -> bare)
cd android
./gradlew assembleRelease  # Windows: .\gradlew assembleRelease
```

Find the APK at `android/app/build/outputs/apk/release/app-release.apk`. Install with `adb install -r app-release.apk`. For signed releases, create a keystore and update signing config in `android/app/build.gradle`.

## Troubleshooting

- **Blank window or ERR_FILE_NOT_FOUND for /\_expo/...**: Run `npm run web:export` before packaging to create `dist/`; the Electron static server serves those assets.
- **No audio**: Verify the stream URL works in a browser and starts with http or https.
- **Notifications not showing**: Grant notification permission; on Android, ensure the Playback channel exists.
- **Dev server not ready**: When running `npm run electron`, Expo must finish starting; wait-on times out after 30s if it cannot reach the dev URL.
- **Google sign-in fails or stays on "Local only"**: Confirm Firebase config is filled in (`services/firebase.config.ts` or env vars) and Google Sign-In is enabled for your Firebase project and platform.
- **Sync stuck offline**: Check network connectivity; pending changes are queued in AsyncStorage and replay when the connection returns.
- **Build issues**: Ensure Node.js 18+, Expo CLI installed, and platform-specific tooling for native builds.

## Project Structure

- `App.tsx` - Main UI and playback logic.
- `index.ts` - Expo entry point registering the root component.
- `services/firebase.config.ts` - Firebase and Google Sign-In configuration.
- `services/authService.ts` - Google authentication (web and native) via Firebase.
- `services/syncService.ts` - Firestore sync, offline queue, and sync status.
- `electron/main.js` - Electron bootstrap and static server for production.
- `electron/run-electron.js` - Dev helper to wait for Expo web then start Electron.
- `dist/` - Expo web export (created by `web:export`).
- `release/` - Build artifacts (created by `electron:build`).
- `assets/` - Icons and images.

## Scripts Reference

- `npm run start` - Expo start (choose platform in CLI).
- `npm run web` - Expo web dev server.
- `npm run android` - Run on Android.
- `npm run ios` - Run on iOS.
- `npm run electron` - Expo web dev + Electron dev.
- `npm run web:export` - Static web export to `dist/`.
- `npm run electron:pack` - Bundle export + run Electron in production mode.
- `npm run electron:build` - Build Windows installer to `release/`.
- `npm run prebuild:android` - Prebuild for Android.
- `npm run build:android:local` - Build local Android APK.

## Contributing

This project is private. Contributions are not accepted at this time.

## License

This project is private and not licensed for public use.

---

Built for folks who keep too many radio tabs open. Enjoy.
