import {Platform, PermissionsAndroid} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import {api} from './api';

const INSTALLATION_KEY = '@fastfood_one_installation_id';

export async function getInstallationId() {
  let id = await AsyncStorage.getItem(INSTALLATION_KEY);

  if (!id) {
    id = `${Platform.OS}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 14)}`;

    await AsyncStorage.setItem(INSTALLATION_KEY, id);
  }

  return id;
}

// Demande la permission système Android 13+ uniquement.
async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function preparePushRegistration() {
  // 1. Permission système Android 13+
  const androidPermission = await requestAndroidNotificationPermission();
  if (!androidPermission) {
    throw new Error('Permission de notification refusée sur Android.');
  }

  // 2. Enregistrement du device auprès de Firebase (obligatoire sur iOS, recommandé partout)
  try {
    await messaging().registerDeviceForRemoteMessages();
  } catch (e) {
    console.warn('[FCM] registerDeviceForRemoteMessages:', e?.message);
  }

  // 3. Permission Firebase (iOS principalement)
  try {
    const authorization = await messaging().requestPermission();
    const authorized =
      authorization === messaging.AuthorizationStatus.AUTHORIZED ||
      authorization === messaging.AuthorizationStatus.PROVISIONAL;

    if (Platform.OS === 'ios' && !authorized) {
      throw new Error('Autorisation des notifications Firebase refusée.');
    }
  } catch (e) {
    if (Platform.OS === 'ios') throw e;
    console.warn('[FCM] requestPermission:', e?.message);
  }

  // 4. Récupération du token — plusieurs tentatives (APNs peut être lent sur iOS)
  let token = null;
  for (let attempt = 0; attempt < 3 && !token; attempt++) {
    try {
      token = await messaging().getToken();
    } catch (e) {
      console.warn(`[FCM] getToken tentative ${attempt + 1}:`, e?.message);
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  if (typeof token !== 'string' || token.trim().length < 20) {
    throw new Error('Firebase n’a pas fourni de token FCM valide.');
  }

  const installationId = await getInstallationId();

  return {
    token: token.trim(),
    installationId,
    platform: Platform.OS,
    deviceLabel: `${Platform.OS} FastFood One`,
  };
}