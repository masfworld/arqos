# Running the Frontend Locally

This guide will help you run the Arqos frontend application locally.

## Prerequisites

- **Node.js** 18+ installed
- **npm** or **yarn** package manager
- **Expo CLI** (optional, but recommended for better experience)

## Quick Start

### 1. Install Dependencies

```bash
cd apps/frontend
npm install --legacy-peer-deps
```

**Note**: The `--legacy-peer-deps` flag is needed due to a dependency conflict between `victory-native` (which requires React 19) and the project's React 18.3.1. This is safe to use and won't affect functionality.

### 2. Start the Development Server

**For Web (recommended for quick testing):**
```bash
npm run web
# or
npx expo start --web
```

**For Mobile/All Platforms:**
```bash
npm start
# or
npx expo start
```

This will:
- Start the Expo development server
- Open a QR code in your terminal
- Show options to open in:
  - **Web browser** (press `w`)
  - **iOS Simulator** (press `i`) - requires Xcode on macOS
  - **Android Emulator** (press `a`) - requires Android Studio
  - **Expo Go app** on your phone (scan QR code)

### 3. Access the Application

- **Web**: The app will automatically open in your default browser, typically at `http://localhost:8081` or `http://localhost:19006`
- **Mobile**: Use the Expo Go app to scan the QR code, or press `i`/`a` for simulators

## Available Scripts

- `npm start` - Start Expo development server (all platforms)
- `npm run web` - Start Expo for web only
- `npm run android` - Run on Android emulator/device
- `npm run ios` - Run on iOS simulator/device
- `npm run lint` - Run ESLint

## Environment Configuration

Currently, the frontend doesn't require environment variables, but if you need to configure the backend API URL, you can:

1. Create a `.env` file in `apps/frontend/`:
```bash
API_URL=http://localhost:3000
```

2. Use environment variables in your code (you may need to install `expo-constants` or use a library like `react-native-dotenv`)

## Troubleshooting

### Port Already in Use
If port 8081 or 19006 is already in use:
```bash
# Kill the process using the port
lsof -ti:8081 | xargs kill -9
# or
lsof -ti:19006 | xargs kill -9
```

### Metro Bundler Issues
Clear the cache and restart:
```bash
npx expo start --clear
```

### Dependencies Issues
Delete `node_modules` and reinstall:
```bash
rm -rf node_modules
npm install
```

### Web Not Working
Make sure you have the web dependencies:
```bash
npx expo install react-dom react-native-web
```

## Development Tips

- **Hot Reload**: Changes are automatically reflected (no need to refresh)
- **Debugging**: Use React Native Debugger or Chrome DevTools
- **Logs**: Check the terminal where Expo is running for logs
- **Reload**: Press `r` in the terminal to reload the app
- **Menu**: Press `m` to open the developer menu

## Next Steps

Once the frontend is running:
1. Make sure the backend is running on `http://localhost:3000`
2. The frontend will connect to the backend API endpoints
3. Test authentication and data fetching

## Platform-Specific Notes

### Web
- Uses React Native Web for rendering
- Best for quick development and testing
- Some native features may not be available

### iOS
- Requires macOS and Xcode
- Use `npm run ios` or press `i` in Expo
- Simulator will open automatically

### Android
- Requires Android Studio and Android SDK
- Use `npm run android` or press `a` in Expo
- Emulator must be running first

