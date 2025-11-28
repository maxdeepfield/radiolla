# Installation Guide

## Prerequisites

- Node.js 20+
- npm 9+
- Git

### Platform-Specific Requirements

| Platform | Requirements |
|----------|--------------|
| Android | Java 17 (JDK), Android Studio with SDK |
| iOS | macOS, Xcode 15+, Apple Developer account |
| Windows (Electron) | Windows 10/11 |
| Web | Modern browser |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/radiolla.git
cd radiolla

# Install dependencies
npm install

# Start development server
npm start
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run web` | Start web development server |
| `npm run android` | Run on Android device/emulator |
| `npm run ios` | Run on iOS simulator |
| `npm run electron` | Run desktop app in development |
| `npm run typecheck` | Run TypeScript type checking |

---

## Build Commands

| Command | Platform | Output |
|---------|----------|--------|
| `npm run web:export` | Web | `dist/` folder |
| `npm run electron:build` | Windows | `release/*.exe` |
| `npm run android` | Android | Debug APK |

### Android Release Build

```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/
```

### iOS Build

iOS builds require EAS Build (Expo Application Services):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project (first time only)
eas build:configure

# Build for iOS
eas build --platform ios
```

---

## iOS Setup

### First-Time Setup

1. Install Xcode from the Mac App Store
2. Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Accept Xcode license:
   ```bash
   sudo xcodebuild -license accept
   ```
4. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```

### Running on Simulator

```bash
npm run ios
```

### Running on Device

1. Open `ios/Radiolla.xcworkspace` in Xcode
2. Select your device
3. Configure signing with your Apple Developer account
4. Build and run

---

## Android Setup

### First-Time Setup

1. Install [Android Studio](https://developer.android.com/studio)
2. Install Android SDK via Android Studio
3. Set environment variables:
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```

### Running on Emulator

```bash
npm run android
```

### Running on Device

1. Enable USB debugging on your device
2. Connect via USB
3. Run `npm run android`

---

## Troubleshooting

### Node Modules Issues

```bash
rm -rf node_modules package-lock.json
npm install
```

### Expo Cache Issues

```bash
npx expo start --clear
```

### Android Build Issues

```bash
cd android
./gradlew clean
cd ..
npm run android
```

### iOS Build Issues

```bash
cd ios
pod deintegrate
pod install
cd ..
npm run ios
```

### Metro Bundler Issues

```bash
npx expo start --clear
# Or reset cache completely:
rm -rf .expo
npm start
```
