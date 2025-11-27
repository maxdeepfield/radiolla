# Installation Guide

## Prerequisites

- Node.js 20+
- npm 9+
- Git

### Platform-specific

**Android Development:**
- Java 17 (JDK)
- Android Studio with SDK

**Windows Desktop (Electron):**
- Windows 10/11

**Docker Deployment:**
- Docker 20+
- Docker Compose v2+

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

## Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run web` | Start web development server |
| `npm run android` | Run on Android device/emulator |
| `npm run electron` | Run desktop app in development |
| `npm run typecheck` | Run TypeScript type checking |

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run web:export` | Export web build to `dist/` |
| `npm run electron:build` | Build Windows installer |

## Troubleshooting

**Node modules issues:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Expo cache issues:**
```bash
npx expo start --clear
```

**Android build issues:**
```bash
cd android
./gradlew clean
cd ..
npm run android
```
