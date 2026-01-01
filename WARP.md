# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Key commands

### Install & basic dev
- Install dependencies: `npm install`
- Start Expo (select platform from CLI): `npm run start`
- Web dev server: `npm run web`
- Android (runs native app via Expo prebuild): `npm run android`
- iOS (macOS only): `npm run ios`
- Electron dev (Expo web + Electron, uses `.expo/dev-server-info.json`): `npm run electron`

### Web/Electron production flow
- Export static web bundle for Electron (outputs to `dist/`): `npm run web:export`
- Build Windows Electron installer into `release/`: `npm run electron:build`

### Android native builds
These assume you have the Android toolchain and `adb` installed.
- Clean Android build artifacts: `npm run android:clean`
- Prebuild Android project (managed → bare, regenerates `android/`): `npm run android:prebuild`
- Debug APK build: `npm run android:build:debug`
- Release APK build (Windows batch gradle): `npm run android:build:release`
- Install debug APK on a connected device: `npm run android:install`
- Install release APK on a connected device: `npm run android:install:release`
- Launch the installed Android app: `npm run android:launch`
- View Android JS logs: `npm run android:logcat`

A common local release flow is:
1. `npm run android:clean`
2. `npm run android:prebuild`
3. `npm run android:build:release`
4. `npm run android:install:release`
5. `npm run android:launch`

### Quality checks & formatting
- Type-check only (no emit): `npm run typecheck`
- Lint TypeScript/TSX: `npm run lint`
- Auto-fix lint issues: `npm run lint:fix`
- Format all supported files with Prettier: `npm run format`
- Check formatting without writing: `npm run format:check`
- Combined lightweight check (typecheck + lint): `npm run check`

### Tests (Vitest)
- Run the full test suite once: `npm test`
- Watch tests continuously during development: `npm run test:watch`
- Run a single test file (Vitest): `npm test -- services/stationSerializer.test.ts`

Vitest is configured in `vitest.config.ts` to pick up `**/*.test.ts` and exclude `node_modules`, `dist`, `android`, and `release`.

### Maintenance utilities
- Remove build artifacts (`dist`, `build`, `release`, `android/app/build`): `npm run clean`
- Generate Windows ICO from `assets/icon.png` (used by Electron packaging): `npm run generate:icon`

## High-level architecture

### Overall
Radiolla is an Expo/React Native app targeting web, mobile (Android/iOS), and desktop (Electron) with a shared UI and logic layer. Core responsibilities are split into three main areas:
- **UI & interaction layer** under `client/` (React components, modals, layout, theme).
- **State & persistence layer** via React Context providers in `client/context/` backed by `AsyncStorage`.
- **Platform services** in `services/` (auth, sync, audio, notifications, Firebase config) and Electron glue code under `electron/`.

The root `App.tsx` simply re-exports the client app so that Expo’s default entrypoint stays minimal while all real work happens in `client/App.tsx`.

### UI & context layer (`client/`)
- **Entry component**: `client/App.tsx` is the main UI tree. It wires together:
  - `SettingsProvider` / `useSettings` (theme + layout styles, compact UI, status bar style).
  - `StationsProvider` / `useStations` (station collection, persistence, import/export, and sync integration).
  - `AudioProvider` / `useAudio` (stream playback, volume, track metadata, Electron IPC integration).
- **Layout & shell**:
  - `Header` shows the app title and search/menu triggers.
  - A scrollable list of stations rendered via `StationCard` components (tap to play/stop, long-press + drag for reordering, inline menu for edit/remove).
  - `PlayerBar` at the bottom exposes now-playing info, primary play/stop control, and a volume toggle/slider.
  - A side-style `Menu` overlay hosts secondary actions (Add station, Import/Export, Settings, About) and the sync status indicator.
- **Modals** (`client/components/modals/`):
  - `AddStationModal` handles create/edit of stations (name + URL) and feeds into `StationsContext`.
  - `ImportExportModal` drives JSON-based station import/export (using the `stationSerializer` service).
  - `SettingsModal` exposes theme/compact UI toggles and sign-in/sign-out controls.
  - `AboutModal` is informational; `ErrorModal` is used by the global error boundary in `client/App.tsx`.
- **SettingsContext** (`client/context/SettingsContext.tsx`):
  - Persists **theme preference** (`auto` / `light` / `dark`) and **compact UI** flag to `AsyncStorage`.
  - Derives a `resolvedTheme`, selects a color **palette**, and builds a memoized `styles` object via `createStyles`.
  - Drives consistent styling across all components and status bar configuration.
- **StationsContext** (`client/context/StationsContext.tsx`):
  - Owns the list of stations (`id`, `name`, `url`), persisted under `Radiolla:stations` in `AsyncStorage`.
  - Exposes CRUD operations (`addStation`, `updateStation`, `removeStation`, `reorderStations`, `clearStations`, `importStations`).
  - Bridges to the sync layer by creating `PendingChange` items and:
    - Immediately pushing changes when online and signed in.
    - Queuing them via `syncService.addPendingChange` when offline.
  - `setStationsFromSync` replaces local stations from a merged/synced list without re-triggering sync.
- **AudioContext** (`client/context/AudioContext.tsx`):
  - Wraps a platform-specific `AudioService` (see below) and tracks:
    - `currentStation` / `lastStation`.
    - `playbackState` (`idle` | `loading` | `playing`).
    - `nowPlayingTrack` (ICY metadata or Electron-fetched metadata).
    - `streamError` and `volume`.
  - Implements `playStation`, `stopPlayback`, volume updates, and a `handlePrimaryControl` used by `PlayerBar`.
  - Integrates with Electron via `window.ipcRenderer` (when available on web):
    - Listens for `playback-control` IPC events from the tray (toggle/play/stop).
    - Sends `playback-state` updates back to the main process.
  - Periodically polls stream metadata (directly on web or via IPC `fetch-stream-metadata` inside Electron) to populate `nowPlayingTrack` and lock-screen / notification metadata.
  - Coordinates with `notificationService` to show/hide a native playback notification on mobile platforms.
  - Owns global error-handling hooks (React Native global handler, `window.onerror`, `unhandledrejection`) and funnels unexpected errors into `ErrorModal` via state in `client/App.tsx`.

### Auth & sync (`services/authService.ts`, `services/syncService.ts`, `services/stationSerializer.ts`, `services/firebase.config.ts`)
- **Firebase & Google Sign-In configuration** (`services/firebase.config.ts`):
  - Defines a typed `firebaseConfig` object whose values are pulled from environment variables (`FIREBASE_*`) or placeholder strings.
  - Provides helpers `isFirebaseConfigured` and `isGoogleSignInConfigured` that check whether real credentials have been supplied.
  - Exposes Google client IDs (`googleWebClientId`, `googleAndroidClientId`, `googleIosClientId`) for the corresponding platforms.
  - Centralizes Firestore collection names and sync tunables (`syncConfig`), including retry counts, backoff delays, and AsyncStorage keys for sync metadata.
- **AuthService** (`services/authService.ts`):
  - Wraps **Firebase Auth** + **Google Sign-In** across platforms:
    - Web: uses Firebase web SDK with `GoogleAuthProvider` and popup auth.
    - Native: uses `@react-native-firebase/auth` with `@react-native-google-signin/google-signin` and ID tokens.
  - Maintains an in-memory `currentUser` and a set of listeners (`AuthStateCallback`) to broadcast auth state changes.
  - Exposes:
    - `signIn` / `signOut` with user-friendly error messages and silent handling of user cancellations.
    - `getCurrentUser`, `onAuthStateChanged`, `isAuthenticated`, `getAuthState`.
  - Initialization is lazy: `initializeFirebase` runs on first need and sets up platform-specific Auth listeners.
- **GoogleAuthButton UI** (`client/components/GoogleAuthButton.tsx`):
  - Presents a sign-in button when logged out, and a signed-in header + sign-out control otherwise.
  - Delegates to `authService` and accepts `onSignIn` / `onSignOut` / `onError` hooks, allowing higher-level components (e.g. `SettingsModal`, `client/App.tsx`) to hook into sign-in/out for sync.
- **SyncService** (`services/syncService.ts`):
  - Centralizes synchronization between local `StationsContext` state and Firestore.
  - Provides a **sync state machine** (`SyncState` = `idle` | `syncing` | `synced` | `error` | `offline`) with subscription (`onSyncStateChanged`) used by `SyncStatusIndicator`.
  - Manages a persistent **pending changes queue** in `AsyncStorage` for offline modifications:
    - `PendingChange` records (`type` add/update/delete, station payload, timestamp) are created via `createPendingChange` and stored with deduplication/compaction logic in `addPendingChange`.
    - `processPendingChanges` drains the queue and pushes each change to Firestore; failures on network errors halt and retain the remaining queue.
  - Firestore integration:
    - `uploadStations` does full replacement of a user’s stations via batched writes.
    - `downloadStations` fetches all stations for a user.
    - `pushStationChange` applies one `PendingChange` (`add`, `update`, `delete`) with retry via `withRetry` (exponential backoff, tunable via `syncConfig`).
  - Initial sync entrypoint: `syncStations(localStations, userId)`
    - Processes pending changes first.
    - Fetches cloud stations, handling network errors by setting the state to `offline` and returning a failure result while preserving local data.
    - Chooses among three strategies:
      - Only local data → upload all to cloud.
      - Only cloud data → adopt cloud list locally.
      - Both present → merge via `mergeStations` (deduplicate by normalized URL, local-first), then upload the merged list.
    - Updates `SyncState` to `synced` on success.
  - **Network awareness**:
    - Uses `@react-native-community/netinfo` to monitor connectivity.
    - `startNetworkListener(userId, onNetworkRestored?)` sets up global listeners:
      - Transitions to `offline` when connectivity is lost.
      - When connectivity resumes, processes the pending queue and optionally runs a full sync via the callback.
    - `stopNetworkListener` tears everything down; this is called on sign-out and app unmount.
  - `SyncStatusIndicator` consumes `SyncService` state to render compact “Local only” / “Syncing…” / “Synced” / “Offline” / “Sync failed” statuses, with an optional Retry button wired to `syncStations`.
- **Station serialization** (`services/stationSerializer.ts`):
  - Provides `serialize` (stations → JSON) and `deserialize` (JSON → validated stations or error) helpers for import/export flows.
  - Validation is explicit and defensive: it ensures the payload is an array and that every element has string `id`, `name`, and `url`; otherwise returns `{ error: string }`.

### Audio & notifications (`services/audioService.ts`, `services/notificationService.ts`, `services/trackPlayerService.ts`)
- **AudioService abstraction** (`services/audioService.ts`):
  - Exposes a unified `AudioService` interface consumed by `AudioContext` with methods to `play`, `stop`, `setVolume`, `setActiveForLockScreen`, `setCallbacks`, and `updateMetadata`.
  - On **web/Electron**, uses an `ExpoAudioService` backed by `expo-audio`:
    - Lazily creates and replaces a single `AudioPlayer` bound to the stream URL.
    - Controls playback and volume in-process (no background/lock screen integration).
  - On **mobile**, uses `TrackPlayerAudioService` backed by `react-native-track-player`:
    - Ensures TrackPlayer is initialized once (`setupTrackPlayer`).
    - Uses `playStream` / `stopStream` helpers to handle live stream playback.
    - Delegates metadata updates to `updateTrackMetadata` for lock screen and notification integration.
  - `getAudioService` returns a lazy-initialized singleton appropriate for the current platform.
  - `initializeAudioMode` configures global audio mode via `setAudioModeAsync` and ensures TrackPlayer is set up on non-web platforms.
- **TrackPlayer wrapper** (`services/trackPlayerService.ts`):
  - Encapsulates `react-native-track-player` setup and remote-control handling.
  - `PlaybackService` hooks into TrackPlayer events (`RemotePlay`, `RemotePause`, `RemoteStop`, `RemoteNext`, `RemotePrevious`, `RemoteDuck`) and dispatches back into callbacks registered from `AudioContext` through `setTrackPlayerCallbacks`.
  - Provides platform-guarded helpers such as `playStream`, `stopStream`, `pauseStream`, `resumeStream`, `setTrackPlayerVolume`, `updateTrackMetadata`, and `getPlayerState`.
- **Notification integration** (`services/notificationService.ts`):
  - Configures an Android channel named “Playback” with low importance and no vibration/badge.
  - Exposes `showPlaybackNotification` and `hidePlaybackNotification` used by `AudioContext` when playback state changes.
  - Intentionally no-ops on web; notifications are mobile-only.

### Electron desktop shell (`electron/`)
- **Main process** (`electron/main.js`):
  - Starts a hardened static HTTP server rooted at `dist/` (Expo web export), with MIME-type mapping and path traversal protection.
  - Creates the main `BrowserWindow` with:
    - Persisted window bounds in `${userData}/window-state.json`.
    - Dark background and a custom preload script (`electron/preload.js`, not described here but it exposes IPC hooks such as `ipcRenderer` to the web app).
  - Enforces a **single-instance lock**: second invocations focus the existing window instead of opening a new instance.
  - Manages a **system tray integration**:
    - Tray menu toggles playback (sends `playback-control` IPC actions like `play`/`stop`/`mute`).
    - Tracks `isPlaying` and mute state in the main process and rebuilds menus when these change.
  - Tracks playback state updates via IPC (`playback-state` messages from `AudioContext`) to keep the tray label (`▶ Play` vs `⏹ Stop`) in sync with the UI.
  - Cleanly stops the static server and quits the app from the tray.
- **Dev runner** (`electron/run-electron.js`):
  - Used by `npm run electron` to attach Electron to an existing Expo web dev server.
  - Resolves the target dev URL in priority order:
    - `EXPO_WEB_URL` env var, if set.
    - `EXPO_WEB_PORT` / `WEB_PORT` (both `localhost` and `127.0.0.1`).
    - Values discovered in `.expo/dev-server-info.json`.
    - Default ports 8081 and 8082.
  - Waits for the URL to become reachable via `wait-on` and then spawns Electron pointing at `electron/main.js`, taking care not to inherit `ELECTRON_RUN_AS_NODE`.

### Testing layout
- **Test runner**: Vitest is configured in `vitest.config.ts` with a Node test environment and `globals: true`.
- **Location of tests**: service-level tests live under `services/` alongside their implementations (e.g. `stationSerializer.test.ts`, `syncService.test.ts`). These focus on pure logic such as serialization, sync rules, and merge behavior, rather than React components.

### Firebase & Google Sign-In prerequisites
Features that rely on authentication and cloud sync (Google sign-in, Firestore-backed station sync, cross-device merging) depend on proper Firebase configuration:
- Update `services/firebase.config.ts` with real Firebase project credentials or provide the corresponding environment variables (e.g. `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, client IDs for web/Android/iOS).
- Until `isFirebaseConfigured()` and `isGoogleSignInConfigured()` return `true`, auth flows will either no-op or surface configuration warnings, and sync will effectively run in local-only mode.
