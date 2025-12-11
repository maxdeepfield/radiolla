# Radiolla Android Native App Setup

A pure native Android app built with **Kotlin** and **Jetpack Compose**, featuring ExoPlayer for audio streaming and Material 3 design.

## Requirements

- **Android Studio** (2023.1.1 or later)
- **Android SDK** 35 (Compile target)
- **Android SDK** 26+ (Minimum API level)
- **JDK 17**
- **Gradle 8.1.4**

## Project Structure

```
android-native/
├── app/
│   ├── src/main/
│   │   ├── java/fm/radiolla/
│   │   │   ├── MainActivity.kt                    # Entry point
│   │   │   ├── data/
│   │   │   │   ├── Station.kt                     # Room entity
│   │   │   │   ├── StationDao.kt                  # Database DAO
│   │   │   │   ├── RadioDatabase.kt               # Room database
│   │   │   │   └── StationRepository.kt           # Data repository
│   │   │   ├── service/
│   │   │   │   ├── AudioService.kt                # ExoPlayer audio service
│   │   │   │   └── PlaybackService.kt             # Foreground service
│   │   │   ├── preferences/
│   │   │   │   └── ThemePreferences.kt            # Theme + volume storage
│   │   │   ├── ui/
│   │   │   │   ├── RadioViewModel.kt              # App state management
│   │   │   │   ├── theme/
│   │   │   │   │   ├── Color.kt                   # Theme palettes
│   │   │   │   │   └── Theme.kt                   # Compose theme
│   │   │   │   └── screens/
│   │   │   │       ├── MainScreen.kt              # Main layout
│   │   │   │       ├── StationListScreen.kt       # Station list
│   │   │   │       ├── PlayerControlsScreen.kt    # Player controls
│   │   │   │       ├── MenuPanel.kt               # Menu drawer
│   │   │   │       └── Modals.kt                  # Add/Import/About dialogs
│   │   │   └── utils/
│   │   │       ├── PlaylistParser.kt              # M3U/PLS parsing
│   │   │       └── FileHandler.kt                 # Import/export handling
│   │   ├── res/
│   │   │   ├── values/
│   │   │   │   ├── strings.xml
│   │   │   │   ├── colors.xml
│   │   │   │   └── styles.xml
│   │   │   └── xml/
│   │   │       ├── file_paths.xml
│   │   │       ├── backup_rules.xml
│   │   │       └── data_extraction_rules.xml
│   │   └── AndroidManifest.xml
│   ├── build.gradle.kts                           # App build config
│   └── proguard-rules.pro                         # Proguard rules
├── build.gradle.kts                               # Root build config
├── settings.gradle.kts
└── gradle.properties                              # Gradle settings
```

## Setup Instructions

### 1. Open in Android Studio

```bash
# Navigate to the android-native directory
cd android-native

# Or open directly from Android Studio:
# File > Open > select android-native folder
```

### 2. Sync Gradle Files

1. Click "Sync Now" when prompted
2. Wait for dependencies to download
3. Verify build succeeds: `Build > Make Project`

### 3. Configure SDK

Ensure the following are installed in Android SDK Manager:

- **SDK Platform 35** (API Level 35)
- **Build-Tools 35.x**
- **Android Emulator** or connect a physical device

### 4. Build and Run

**Debug Build:**

```bash
./gradlew installDebug
```

**Run on Device:**

```bash
./gradlew connectedAndroidTest
```

**Release Build:**

```bash
./gradlew assembleRelease
```

The APK will be generated in: `app/build/outputs/apk/`

## Key Features

### 1. **Station Management**

- Add/Edit/Delete radio stations
- Persistent storage with Room database
- Quick play/pause from list

### 2. **Audio Playback**

- ExoPlayer-based streaming with autoplay recovery
- Volume control with mute toggle
- Metadata fetching from ICY streams (currently on main thread - can be moved to coroutines)

### 3. **Theme System**

- Auto/Light/Dark theme modes
- Material 3 color system
- DataStore-based preferences

### 4. **Import/Export**

- M3U playlist format support
- PLS playlist format support
- FileProvider for secure file access

### 5. **UI Framework**

- 100% Jetpack Compose
- Material 3 design components
- Responsive layouts

## Architecture

The app uses **MVVM** pattern with coroutines:

- **ViewModel** (`RadioViewModel.kt`) - State management
- **Repository** (`StationRepository.kt`) - Data abstraction
- **Room Database** - Local persistence
- **DataStore** - Preferences persistence
- **Compose Screens** - UI layer

### State Flow

```
MainActivity
    ↓
RadioTheme (Material3)
    ↓
MainScreen
    ├─ StationListScreen (using appState.stations)
    ├─ PlayerControlsScreen (using appState.playbackState)
    ├─ MenuPanel (settings & theme)
    └─ Modals (Add/Import/About)

User Actions → ViewModel → Repository/AudioService → State Update → Recomposition
```

## Customization

### Changing Theme Colors

Edit `ui/theme/Color.kt`:

```kotlin
val LightPalette = ThemePalette(
    background = Color(0xFFF5F4FB),
    // ... customize colors
)
```

### Adding Permissions

Update `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.YOUR_PERMISSION" />
```

### Extending Audio Features

Modify `service/AudioService.kt` to add:

- Equalizer support
- Sleep timer
- Favorite stations
- Bluetooth controls

## Troubleshooting

### Build Errors

**Issue:** `compileSdkVersion 35 not found`

```bash
# Solution: Install API 35 in SDK Manager
# Settings > Appearance & Behavior > System Settings > Android SDK
# SDK Platforms tab > Check "Android 15"
```

**Issue:** `Gradle sync failed`

```bash
# Solution: Clear gradle cache
./gradlew clean
./gradlew build
```

### Runtime Issues

**Issue:** App crashes on first launch

- Check AndroidManifest.xml permissions
- Verify Room database path in RadioDatabase.kt
- Check LogCat for detailed error messages

**Issue:** Audio not playing

- Verify URL is valid HTTP/HTTPS stream
- Check internet permission in AndroidManifest.xml
- Test stream URL in browser

### File Export Issues

**Issue:** Export button does nothing

- Ensure FileProvider is configured in AndroidManifest.xml
- Check file_paths.xml is present
- Verify app has WRITE_EXTERNAL_STORAGE permission

## Build Variants

The app supports standard debug/release variants. To create custom variants, modify `app/build.gradle.kts`:

```kotlin
flavorDimensions = listOf("app")
productFlavors {
    create("free") {
        // Free variant config
    }
    create("pro") {
        // Pro variant config
    }
}
```

## Dependencies

Key libraries (see `app/build.gradle.kts`):

- **androidx.media3:media3-exoplayer** - Audio streaming
- **androidx.room** - Local database
- **androidx.datastore** - Preferences
- **androidx.compose** - UI framework
- **androidx.navigation** - Navigation
- **com.squareup.okhttp3** - HTTP client
- **com.google.code.gson** - JSON parsing (optional)

## Performance Optimization

1. **Audio Service** - ExoPlayer handles streaming efficiently
2. **Database** - Room with Flow for reactive updates
3. **Compose** - Recomposition limited to changed state
4. **Memory** - AudioService resources released onCleared()

## Testing

Add test dependencies to verify:

```kotlin
testImplementation("junit:junit:4.13.2")
androidTestImplementation("androidx.test.ext:junit:1.1.5")
androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
```

Run tests:

```bash
./gradlew test
./gradlew connectedAndroidTest
```

## Distribution

### Create Signed Release APK

1. **Generate Keystore:**

```bash
keytool -genkey -v -keystore radiolla-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias radiolla
```

2. **Sign in gradle.properties:**

```properties
RELEASE_STORE_FILE=radiolla-release.keystore
RELEASE_STORE_PASSWORD=your_password
RELEASE_KEY_ALIAS=radiolla
RELEASE_KEY_PASSWORD=your_password
```

3. **Build:**

```bash
./gradlew assembleRelease
```

### Upload to Google Play Store

See: https://developer.android.com/studio/publish

## Port from Expo Notes

This native Android app maintains feature parity with the Expo version:

| Feature             | Expo | Android Native  |
| ------------------- | ---- | --------------- |
| Station Management  | ✅   | ✅              |
| Audio Playback      | ✅   | ✅ (ExoPlayer)  |
| Stream Metadata     | ✅   | ✅              |
| Theme System        | ✅   | ✅ (Material 3) |
| Import/Export       | ✅   | ✅              |
| Lock Screen Control | ✅   | 🔄 (Partial)    |
| Notifications       | ✅   | ✅ (Foreground) |

## License

See LICENSE file in project root

## Support

For issues or questions, refer to:

- Android Documentation: https://developer.android.com/docs
- ExoPlayer Guide: https://exoplayer.dev/
- Jetpack Compose: https://developer.android.com/jetpack/compose
- Material Design 3: https://m3.material.io/
