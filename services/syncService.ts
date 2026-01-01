/**
 * SyncService Module
 * Manages synchronization between local and cloud storage for Radiolla.
 *
 * This service provides:
 * - Sync state management (idle, syncing, synced, error, offline)
 * - Pending changes queue for offline support
 * - State change notifications
 * - Firestore CRUD operations for cloud storage
 *
 * @requirements 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2, 5.3, 5.4 - Sync and Offline Support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Station } from '../client/context/StationsContext';
import { syncConfig, firestoreCollections } from './firebase.config';

/**
 * Sync state representing the current synchronization status
 * @requirements 5.1, 5.2, 5.3, 5.4 - Sync Status Display
 */
export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  error?: string;
  mergedStations?: Station[];
}

/**
 * Represents a pending change to be synced when online
 * @requirements 4.1 - Queue station changes for later synchronization
 */
export interface PendingChange {
  id: string;
  type: 'add' | 'update' | 'delete';
  station: Station;
  timestamp: number;
}

/**
 * Callback type for sync state changes
 */
export type SyncStateCallback = (state: SyncState) => void;

// Storage key for pending changes queue
const PENDING_CHANGES_KEY = 'Radiolla:pending-changes';

// Store for sync state listeners
const syncStateListeners: Set<SyncStateCallback> = new Set();

// Current sync state
let currentSyncState: SyncState = 'idle';

// Pending changes queue (in-memory cache)
let pendingChangesCache: PendingChange[] | null = null;

/**
 * Notify all registered sync state listeners
 */
function notifySyncStateListeners(): void {
  syncStateListeners.forEach(callback => {
    try {
      callback(currentSyncState);
    } catch (error) {
      console.error('Sync state listener error:', error);
    }
  });
}

/**
 * Get the current sync state
 * @returns Current SyncState
 * @requirements 5.1, 5.2, 5.3, 5.4 - Sync Status Display
 */
export function getSyncState(): SyncState {
  return currentSyncState;
}

/**
 * Set the current sync state and notify listeners
 * @param state - New sync state
 * @requirements 5.1, 5.2, 5.3, 5.4 - Sync Status Display
 */
export function setSyncState(state: SyncState): void {
  if (currentSyncState !== state) {
    currentSyncState = state;
    notifySyncStateListeners();
  }
}

/**
 * Subscribe to sync state changes
 * @param callback - Function to call when sync state changes
 * @returns Unsubscribe function
 * @requirements 5.1, 5.2, 5.3, 5.4 - Sync Status Display
 */
export function onSyncStateChanged(callback: SyncStateCallback): () => void {
  // Add listener
  syncStateListeners.add(callback);

  // Immediately call with current state
  callback(currentSyncState);

  // Return unsubscribe function
  return () => {
    syncStateListeners.delete(callback);
  };
}

/**
 * Load pending changes from AsyncStorage
 * @returns Array of pending changes
 */
async function loadPendingChanges(): Promise<PendingChange[]> {
  if (pendingChangesCache !== null) {
    return pendingChangesCache;
  }

  try {
    const stored = await AsyncStorage.getItem(PENDING_CHANGES_KEY);
    if (stored) {
      pendingChangesCache = JSON.parse(stored);
      return pendingChangesCache || [];
    }
  } catch (error) {
    console.error('Failed to load pending changes:', error);
  }

  pendingChangesCache = [];
  return [];
}

/**
 * Save pending changes to AsyncStorage
 * @param changes - Array of pending changes to save
 */
async function savePendingChanges(changes: PendingChange[]): Promise<void> {
  pendingChangesCache = changes;
  try {
    await AsyncStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
  } catch (error) {
    console.error('Failed to save pending changes:', error);
  }
}

/**
 * Get all pending changes
 * @returns Array of pending changes
 * @requirements 4.1 - Queue station changes for later synchronization
 */
export async function getPendingChanges(): Promise<PendingChange[]> {
  return loadPendingChanges();
}

/**
 * Add a pending change to the queue
 * @param change - The change to add
 * @requirements 4.1 - Queue station changes for later synchronization
 */
export async function addPendingChange(change: PendingChange): Promise<void> {
  const changes = await loadPendingChanges();

  // Check if there's already a pending change for this station
  const existingIndex = changes.findIndex(
    c => c.station.id === change.station.id
  );

  if (existingIndex !== -1) {
    const existing = changes[existingIndex];

    // If the existing change is 'add' and new change is 'delete', remove both
    if (existing.type === 'add' && change.type === 'delete') {
      changes.splice(existingIndex, 1);
      await savePendingChanges(changes);
      return;
    }

    // If the existing change is 'add' and new change is 'update', keep as 'add' with updated data
    if (existing.type === 'add' && change.type === 'update') {
      changes[existingIndex] = {
        ...change,
        type: 'add',
      };
      await savePendingChanges(changes);
      return;
    }

    // Otherwise, replace the existing change with the new one
    changes[existingIndex] = change;
  } else {
    // Add new change to the queue
    changes.push(change);
  }

  await savePendingChanges(changes);
}

/**
 * Remove a pending change from the queue
 * @param changeId - ID of the change to remove
 */
export async function removePendingChange(changeId: string): Promise<void> {
  const changes = await loadPendingChanges();
  const filtered = changes.filter(c => c.id !== changeId);
  await savePendingChanges(filtered);
}

/**
 * Clear all pending changes
 */
export async function clearPendingChanges(): Promise<void> {
  await savePendingChanges([]);
}

/**
 * Check if there are any pending changes
 * @returns true if there are pending changes
 */
export async function hasPendingChanges(): Promise<boolean> {
  const changes = await loadPendingChanges();
  return changes.length > 0;
}

/**
 * Generate a unique ID for a pending change
 * @returns Unique string ID
 */
export function generateChangeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a pending change object
 * @param type - Type of change (add, update, delete)
 * @param station - The station being changed
 * @returns PendingChange object with generated ID and timestamp
 * @requirements 4.1 - Queue station changes for later synchronization
 */
export function createPendingChange(
  type: 'add' | 'update' | 'delete',
  station: Station
): PendingChange {
  return {
    id: generateChangeId(),
    type,
    station,
    timestamp: Date.now(),
  };
}

/**
 * Merge two station lists, removing duplicates based on URL.
 * Preserves all unique stations from both lists.
 * When duplicates are found (same URL), the local station is preferred.
 *
 * @param local - Local station list
 * @param cloud - Cloud station list
 * @returns Merged station list with no duplicate URLs
 * @requirements 2.3 - Merge stations by combining both lists and removing duplicates based on station URL
 */
export function mergeStations(local: Station[], cloud: Station[]): Station[] {
  // Use a Map to track stations by URL (normalized to lowercase for comparison)
  const stationsByUrl = new Map<string, Station>();

  // Add local stations first (they take priority)
  for (const station of local) {
    const normalizedUrl = station.url.toLowerCase().trim();
    stationsByUrl.set(normalizedUrl, station);
  }

  // Add cloud stations only if URL doesn't already exist
  for (const station of cloud) {
    const normalizedUrl = station.url.toLowerCase().trim();
    if (!stationsByUrl.has(normalizedUrl)) {
      stationsByUrl.set(normalizedUrl, station);
    }
  }

  // Return all unique stations as an array
  return Array.from(stationsByUrl.values());
}

/**
 * Cloud station document structure for Firestore
 */
export interface CloudStation {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Sleep utility for retry delays
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an operation with exponential backoff retry logic
 * @param operation - The async operation to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Result of the operation
 * @throws Error if all retries fail
 * @requirements 3.4 - Retry operation up to 3 times with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = syncConfig.maxRetries,
  baseDelay: number = syncConfig.baseRetryDelay
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`,
          lastError.message
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Get the Firestore reference for a user's stations collection
 * @param userId - The user's unique identifier
 * @returns Firestore collection reference
 */
function getStationsCollection(userId: string) {
  return firestore()
    .collection(firestoreCollections.users)
    .doc(userId)
    .collection(firestoreCollections.stations);
}

/**
 * Convert a Station to CloudStation format
 * @param station - The station to convert
 * @returns CloudStation with timestamps
 */
function toCloudStation(station: Station): CloudStation {
  const now = Date.now();
  return {
    id: station.id,
    name: station.name,
    url: station.url,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert a CloudStation to Station format
 * @param cloudStation - The cloud station to convert
 * @returns Station without timestamps
 */
function fromCloudStation(cloudStation: CloudStation): Station {
  return {
    id: cloudStation.id,
    name: cloudStation.name,
    url: cloudStation.url,
  };
}

/**
 * Upload all stations to Firestore for a user
 * Replaces all existing stations in the cloud with the provided list.
 *
 * @param userId - The user's unique identifier
 * @param stations - Array of stations to upload
 * @returns Promise that resolves when upload is complete
 * @throws Error if upload fails after retries
 * @requirements 2.1 - Upload local stations to Cloud_Storage
 */
export async function uploadStations(
  userId: string,
  stations: Station[]
): Promise<void> {
  return withRetry(async () => {
    const collection = getStationsCollection(userId);

    // Use a batch write for atomic operation
    const batch = firestore().batch();

    // First, delete all existing stations
    const existingDocs = await collection.get();
    existingDocs.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Then, add all new stations
    for (const station of stations) {
      const cloudStation = toCloudStation(station);
      const docRef = collection.doc(station.id);
      batch.set(docRef, cloudStation);
    }

    // Commit the batch
    await batch.commit();
  });
}

/**
 * Download all stations from Firestore for a user
 *
 * @param userId - The user's unique identifier
 * @returns Promise that resolves with array of stations
 * @throws Error if download fails after retries
 * @requirements 2.2 - Download stations from Cloud_Storage to Local_Storage
 */
export async function downloadStations(userId: string): Promise<Station[]> {
  return withRetry(async () => {
    const collection = getStationsCollection(userId);
    const snapshot = await collection.get();

    const stations: Station[] = [];
    snapshot.docs.forEach(doc => {
      const data = doc.data() as CloudStation;
      stations.push(fromCloudStation(data));
    });

    return stations;
  });
}

/**
 * Push a single station change to Firestore
 * Handles add, update, and delete operations.
 *
 * @param userId - The user's unique identifier
 * @param change - The pending change to push
 * @returns Promise that resolves when the change is pushed
 * @throws Error if push fails after retries
 * @requirements 3.1, 3.2, 3.3 - Persist station changes to Cloud_Storage
 */
export async function pushStationChange(
  userId: string,
  change: PendingChange
): Promise<void> {
  return withRetry(async () => {
    const collection = getStationsCollection(userId);
    const docRef = collection.doc(change.station.id);

    switch (change.type) {
      case 'add': {
        const cloudStation = toCloudStation(change.station);
        await docRef.set(cloudStation);
        break;
      }
      case 'update': {
        const updateData: Partial<CloudStation> = {
          name: change.station.name,
          url: change.station.url,
          updatedAt: Date.now(),
        };
        await docRef.update(updateData);
        break;
      }
      case 'delete': {
        await docRef.delete();
        break;
      }
    }
  });
}

/**
 * Check if an error is a network-related error
 * @param error - The error to check
 * @returns true if the error is network-related
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('offline') ||
      message.includes('connection') ||
      message.includes('unavailable') ||
      message.includes('timeout') ||
      message.includes('failed to fetch')
    );
  }
  return false;
}

/**
 * Sync stations between local and cloud storage.
 * Implements initial sync on sign-in by merging local and cloud stations.
 *
 * Sync behavior:
 * - First-time sync with existing local stations: uploads local to cloud
 * - New device with existing cloud data: downloads cloud to local
 * - Both local and cloud stations exist: merges by URL, removing duplicates
 *
 * @param localStations - Array of local stations
 * @param userId - The authenticated user's ID
 * @returns SyncResult with success status and merged stations
 * @requirements 2.1, 2.2, 2.3, 2.4 - Initial Sync on Sign-In
 */
export async function syncStations(
  localStations: Station[],
  userId: string
): Promise<SyncResult> {
  // Set state to syncing
  setSyncState('syncing');

  try {
    // First, process any pending changes from offline queue
    await processPendingChanges(userId);

    // Download cloud stations
    let cloudStations: Station[] = [];
    try {
      cloudStations = await downloadStations(userId);
    } catch (error) {
      // If download fails due to network, set offline state
      if (isNetworkError(error)) {
        setSyncState('offline');
        return {
          success: false,
          error: 'Unable to connect. Check your internet connection.',
          mergedStations: localStations,
        };
      }
      throw error;
    }

    // Determine sync strategy based on data presence
    let mergedStations: Station[];

    if (localStations.length === 0 && cloudStations.length === 0) {
      // No stations anywhere - nothing to sync
      mergedStations = [];
    } else if (localStations.length > 0 && cloudStations.length === 0) {
      // First-time sync: upload local stations to cloud
      // Requirements 2.1: Upload local stations to Cloud_Storage
      await uploadStations(userId, localStations);
      mergedStations = localStations;
    } else if (localStations.length === 0 && cloudStations.length > 0) {
      // New device: download cloud stations
      // Requirements 2.2: Download stations from Cloud_Storage to Local_Storage
      mergedStations = cloudStations;
    } else {
      // Both have stations: merge and sync
      // Requirements 2.3: Merge stations by combining both lists and removing duplicates
      mergedStations = mergeStations(localStations, cloudStations);

      // Upload merged list to cloud to ensure consistency
      await uploadStations(userId, mergedStations);
    }

    // Update sync state to synced
    // Requirements 2.4: Update Sync_State to "synced" and display confirmation
    setSyncState('synced');

    return {
      success: true,
      mergedStations,
    };
  } catch (error) {
    // Handle network errors
    if (isNetworkError(error)) {
      setSyncState('offline');
      return {
        success: false,
        error: 'Unable to connect. Check your internet connection.',
        mergedStations: localStations,
      };
    }

    // Handle other errors
    setSyncState('error');
    const errorMessage =
      error instanceof Error ? error.message : 'Sync failed. Please try again.';

    return {
      success: false,
      error: errorMessage,
      mergedStations: localStations,
    };
  }
}

/**
 * Process all pending changes in the offline queue.
 * Attempts to push each change to the cloud and removes successful ones from the queue.
 *
 * @param userId - The authenticated user's ID
 * @returns Promise that resolves when all pending changes are processed
 * @requirements 4.2 - Process queued changes and sync with Cloud_Storage
 */
export async function processPendingChanges(userId: string): Promise<void> {
  const pendingChanges = await getPendingChanges();

  if (pendingChanges.length === 0) {
    return;
  }

  // Sort by timestamp to process in order
  const sortedChanges = [...pendingChanges].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  for (const change of sortedChanges) {
    try {
      await pushStationChange(userId, change);
      // Remove successfully processed change from queue
      await removePendingChange(change.id);
    } catch (error) {
      // If network error, stop processing and keep remaining changes in queue
      if (isNetworkError(error)) {
        console.warn(
          'Network error while processing pending changes, will retry later'
        );
        throw error;
      }

      // For other errors, log and continue with next change
      console.error(`Failed to process pending change ${change.id}:`, error);
    }
  }
}

/**
 * Push a station change to the cloud, or queue it if offline.
 * This is the main entry point for station changes when the user is signed in.
 *
 * @param change - The pending change to push
 * @param userId - The authenticated user's ID
 * @returns Promise that resolves when the change is pushed or queued
 * @requirements 3.1, 3.2, 3.3, 4.1 - Automatic Change Sync and Offline Support
 */
export async function pushChange(
  change: PendingChange,
  userId: string
): Promise<void> {
  try {
    await pushStationChange(userId, change);
  } catch (error) {
    // If network error, queue the change for later
    if (isNetworkError(error)) {
      await addPendingChange(change);
      setSyncState('offline');
      return;
    }
    throw error;
  }
}

// Network connectivity listener state
let networkUnsubscribe: (() => void) | null = null;
let currentUserId: string | null = null;
let isNetworkConnected: boolean = true;

/**
 * Callback type for network-triggered sync
 */
export type NetworkSyncCallback = (userId: string) => Promise<void>;

// Callback to trigger sync when network is restored
let onNetworkRestoredCallback: NetworkSyncCallback | null = null;

/**
 * Handle network state changes.
 * When connectivity is restored, process pending changes and sync.
 *
 * @param state - The new network state
 * @requirements 4.2 - Process queued changes when network connectivity is restored
 */
async function handleNetworkChange(state: NetInfoState): Promise<void> {
  const wasConnected = isNetworkConnected;
  isNetworkConnected = state.isConnected ?? false;

  // If we just came back online and have a user ID
  if (!wasConnected && isNetworkConnected && currentUserId) {
    console.log('Network connectivity restored, processing pending changes...');

    try {
      // Check if there are pending changes to process
      const hasPending = await hasPendingChanges();

      if (hasPending) {
        setSyncState('syncing');
        await processPendingChanges(currentUserId);

        // If a callback is registered, trigger full sync
        if (onNetworkRestoredCallback) {
          await onNetworkRestoredCallback(currentUserId);
        }

        setSyncState('synced');
      } else if (currentSyncState === 'offline') {
        // No pending changes but we were offline, update state
        setSyncState('idle');
      }
    } catch (error) {
      console.error(
        'Error processing pending changes after network restore:',
        error
      );
      setSyncState('error');
    }
  } else if (!isNetworkConnected && currentSyncState !== 'offline') {
    // We just went offline
    setSyncState('offline');
  }
}

/**
 * Start listening for network connectivity changes.
 * When connectivity is restored, pending changes will be processed automatically.
 *
 * @param userId - The authenticated user's ID (required for syncing)
 * @param onNetworkRestored - Optional callback to trigger when network is restored
 * @returns Unsubscribe function to stop listening
 * @requirements 4.2 - Process queued changes when network connectivity is restored
 */
export function startNetworkListener(
  userId: string,
  onNetworkRestored?: NetworkSyncCallback
): () => void {
  // Store the user ID for use in the network change handler
  currentUserId = userId;
  onNetworkRestoredCallback = onNetworkRestored || null;

  // Stop any existing listener
  if (networkUnsubscribe) {
    networkUnsubscribe();
  }

  // Start listening for network changes
  networkUnsubscribe = NetInfo.addEventListener(handleNetworkChange);

  // Check initial network state
  NetInfo.fetch().then(state => {
    isNetworkConnected = state.isConnected ?? true;
    if (!isNetworkConnected) {
      setSyncState('offline');
    }
  });

  // Return unsubscribe function
  return () => {
    if (networkUnsubscribe) {
      networkUnsubscribe();
      networkUnsubscribe = null;
    }
    currentUserId = null;
    onNetworkRestoredCallback = null;
  };
}

/**
 * Stop listening for network connectivity changes.
 * @requirements 4.2 - Network connectivity handling cleanup
 */
export function stopNetworkListener(): void {
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
  currentUserId = null;
  onNetworkRestoredCallback = null;
}

/**
 * Check if the device is currently connected to the network.
 * @returns true if connected, false otherwise
 */
export function isOnline(): boolean {
  return isNetworkConnected;
}

/**
 * Fetch the current network state.
 * @returns Promise that resolves with the current network state
 */
export async function getNetworkState(): Promise<NetInfoState> {
  return NetInfo.fetch();
}

// Export the SyncService interface for type checking
export interface SyncService {
  getSyncState(): SyncState;
  onSyncStateChanged(callback: SyncStateCallback): () => void;
  getPendingChanges(): Promise<PendingChange[]>;
  addPendingChange(change: PendingChange): Promise<void>;
  removePendingChange(changeId: string): Promise<void>;
  clearPendingChanges(): Promise<void>;
  hasPendingChanges(): Promise<boolean>;
  setSyncState(state: SyncState): void;
  mergeStations(local: Station[], cloud: Station[]): Station[];
  uploadStations(userId: string, stations: Station[]): Promise<void>;
  downloadStations(userId: string): Promise<Station[]>;
  pushStationChange(userId: string, change: PendingChange): Promise<void>;
  syncStations(localStations: Station[], userId: string): Promise<SyncResult>;
  processPendingChanges(userId: string): Promise<void>;
  pushChange(change: PendingChange, userId: string): Promise<void>;
  startNetworkListener(
    userId: string,
    onNetworkRestored?: NetworkSyncCallback
  ): () => void;
  stopNetworkListener(): void;
  isOnline(): boolean;
  getNetworkState(): Promise<NetInfoState>;
}

// Default export as an object implementing the SyncService interface
const syncService: SyncService = {
  getSyncState,
  onSyncStateChanged,
  getPendingChanges,
  addPendingChange,
  removePendingChange,
  clearPendingChanges,
  hasPendingChanges,
  setSyncState,
  mergeStations,
  uploadStations,
  downloadStations,
  pushStationChange,
  syncStations,
  processPendingChanges,
  pushChange,
  startNetworkListener,
  stopNetworkListener,
  isOnline,
  getNetworkState,
};

export default syncService;
