import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

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

export async function saveDeviceToFirestore(device: {
  deviceId: string;
  name: string;
  created: number;
  revoked: boolean;
  tokenSha256: string;
}): Promise<void> {
  if (!firestore) return;
  try {
    await firestore.collection('devices').doc(device.deviceId).set(device, { merge: true });
  } catch (err) {
    console.warn(`Firestore save device error for ${device.deviceId}:`, err);
  }
}

export async function revokeDeviceInFirestore(deviceId: string): Promise<void> {
  if (!firestore) return;
  try {
    await firestore.collection('devices').doc(deviceId).update({ revoked: true });
  } catch (err) {
    console.warn(`Firestore revoke device error for ${deviceId}:`, err);
  }
}

export { firestore };
