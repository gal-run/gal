/**
 * Firebase initialization for Dashboard (browser-side)
 * Initializes Firebase app and auth
 *
 * Next.js migration: Uses getApps()/getApp() singleton pattern to prevent
 * HMR re-initialization issues.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, type Database } from 'firebase/database';

/**
 * Firebase configuration from environment variables
 * For emulator-only mode, only projectId is required
 */
const emulatorOnlyMode = !!process.env['NEXT_PUBLIC_FIREBASE_DATABASE_EMULATOR_HOST'];
export const firebaseConfig = {
  apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] || (emulatorOnlyMode ? 'emulator-api-key' : undefined),
  authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] || (emulatorOnlyMode ? 'emulator.firebaseapp.com' : undefined),
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] || (emulatorOnlyMode ? 'gal-scheduler-systems' : undefined),
  storageBucket: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
  appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'],
  databaseURL: process.env['NEXT_PUBLIC_FIREBASE_DATABASE_URL'],
};

// Validate configuration (warn but don't throw for optional Firebase features)
const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
];

const missingKeys = requiredKeys.filter(
  (key) => !firebaseConfig[key as keyof typeof firebaseConfig]
);

/**
 * Check if Firebase is properly configured
 * Used to conditionally enable Firebase-based features like Google sign-in
 */
export const isFirebaseConfigured = missingKeys.length === 0;

if (missingKeys.length > 0) {
  console.warn(
    '[FIREBASE] Missing configuration keys:',
    missingKeys.join(', '),
    '- Google sign-in will be disabled'
  );
}

/**
 * Initialize Firebase app (only if configured)
 * Uses singleton pattern to prevent HMR re-initialization in Next.js
 */
export const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;

/**
 * Get Firebase Auth instance (only if configured)
 */
export const auth: Auth | null = app ? getAuth(app) : null;

/**
 * Check if Firebase Realtime Database is properly configured
 * Required for background agent streaming (GAL-571)
 * Also allows emulator-only mode for local development
 */
export const emulatorHost = process.env['NEXT_PUBLIC_FIREBASE_DATABASE_EMULATOR_HOST'];
export const isDatabaseConfigured = isFirebaseConfigured && (!!firebaseConfig.databaseURL || !!emulatorHost);

/**
 * Get Firebase Realtime Database instance (only if configured)
 * Used for background agent session streaming (GAL-571)
 * Note: Must explicitly pass databaseURL - getDatabase(app) alone uses the
 * project's default RTDB URL, which may differ from our configured URL
 */
let _database: Database | null = null;

if (app && isDatabaseConfigured) {
  // Use production URL if available, otherwise just get default database (for emulator)
  _database = firebaseConfig.databaseURL
    ? getDatabase(app, firebaseConfig.databaseURL)
    : getDatabase(app);
}

// Connect to emulator ONLY if explicitly configured via env var
// (Don't auto-connect on localhost - that breaks real Firebase testing)
// NOTE: If databaseURL already points to emulator (contains 127.0.0.1 or localhost),
// we should NOT call connectDatabaseEmulator - it overrides the URL and loses namespace.
export const databaseURLIsEmulator = firebaseConfig.databaseURL &&
  (firebaseConfig.databaseURL.includes('127.0.0.1') ||
   firebaseConfig.databaseURL.includes('localhost'));

if (_database && emulatorHost && !databaseURLIsEmulator) {
  const host = emulatorHost.split(':')[0] || '127.0.0.1';
  const port = parseInt(emulatorHost.split(':')[1], 10) || 9000;
  try {
    connectDatabaseEmulator(_database, host, port);
    console.log(`[FIREBASE] Connected to RTDB Emulator at ${host}:${port}`);
  } catch (e) {
    console.warn('[FIREBASE] Failed to connect to emulator:', e);
  }
} else if (_database && databaseURLIsEmulator) {
  console.log(`[FIREBASE] Using emulator URL directly: ${firebaseConfig.databaseURL}`);
}

export const database: Database | null = _database;

/**
 * Log initialization
 */
console.log('[FIREBASE] Config state:', {
  isFirebaseConfigured,
  isDatabaseConfigured,
  emulatorOnlyMode,
  emulatorHost: emulatorHost || '(not set)',
  hasApp: !!app,
  hasDatabase: !!_database,
  projectId: firebaseConfig.projectId,
  databaseURL: firebaseConfig.databaseURL || '(not set)',
});

if (isFirebaseConfigured) {
  console.log('[FIREBASE] Initialized successfully');
} else {
  console.log('[FIREBASE] Not configured - Google sign-in disabled');
}
