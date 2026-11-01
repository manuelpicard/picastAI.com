import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { DeviceEntry, DeviceStore } from './devices.js';

let firestore: Firestore | null = null;

try {
  if (!getApps().length) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  firestore = dbId ? getFirestore(dbId) : getFirestore();
} catch (err) {
  console.warn('Firebase Admin Firestore initialization:', err);
}

function requireFirestore(): Firestore {
  if (!firestore) throw new Error('Firestore ist nicht initialisiert');
  return firestore;
}

/**
 * Geräteliste in der Collection `devices` (Dokument-ID = deviceId).
 * Gespeichert wird nur der SHA-256-Hash des Tokens, nie der Token selbst.
 * Direkte Client-Zugriffe sperrt firestore.rules; das Admin-SDK umgeht die Regeln.
 */
export class FirestoreDeviceStore implements DeviceStore {
  async loadAll(): Promise<DeviceEntry[]> {
    const snapshot = await requireFirestore().collection('devices').get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        deviceId: String(data.deviceId || doc.id),
        tokenSha256: typeof data.tokenSha256 === 'string' ? data.tokenSha256 : '',
        created: Number(data.created) || 0,
        revoked: data.revoked === true,
        name: typeof data.name === 'string' ? data.name : undefined,
      };
    });
  }

  async save(entry: DeviceEntry): Promise<void> {
    await requireFirestore().collection('devices').doc(entry.deviceId).set({
      deviceId: entry.deviceId,
      name: entry.name || entry.deviceId,
      created: entry.created,
      revoked: entry.revoked,
      tokenSha256: entry.tokenSha256,
    });
  }

  async markRevoked(deviceId: string): Promise<void> {
    // set+merge statt update: legt den Vermerk auch für Geräte an, die nur per
    // Umgebung provisioniert und nie in Firestore gespeichert wurden.
    await requireFirestore().collection('devices').doc(deviceId).set({ deviceId, revoked: true }, { merge: true });
  }
}

export { firestore };
