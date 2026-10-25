
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

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function preparePushRegistration() {
  const permitted = await requestAndroidNotificationPermission();

  if (!permitted) {
    throw new Error('Permission de notification refusée sur Android.');
  }

  try {
    await messaging().registerDeviceForRemoteMessages();
  } catch (error) {
    console.warn(
      '[FCM] Enregistrement du périphérique :',
      error?.message,
    );
  }

  try {
    const authorization = await messaging().requestPermission();

    const authorized =
      authorization === messaging.AuthorizationStatus.AUTHORIZED ||
      authorization === messaging.AuthorizationStatus.PROVISIONAL;

    if (Platform.OS === 'ios' && !authorized) {
      throw new Error(
        'Autorisation des notifications Firebase refusée.',
      );
    }
  } catch (error) {
    if (Platform.OS === 'ios') {
      throw error;
    }

    console.warn('[FCM] Permission Firebase :', error?.message);
  }

  let token = null;

  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    try {
      token = await messaging().getToken();
    } catch (error) {
      console.warn(
        `[FCM] Tentative ${attempt + 1} :`,
        error?.message,
      );

      if (attempt < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
      }
    }
  }

  if (typeof token !== 'string' || token.trim().length < 20) {
    throw new Error(
      'Firebase n’a pas fourni de token FCM valide.',
    );
  }

  return {
    token: token.trim(),
    installationId: await getInstallationId(),
    platform: Platform.OS,
    deviceLabel: `${Platform.OS} FastFood One`,
  };
}

// Enregistre le token FCM sur le serveur après la connexion.
export async function registerPushNotifications() {
  const registration = await preparePushRegistration();

  const response = await api('/api/auth/fcm-token', {
    method: 'POST',
    body: JSON.stringify(registration),
  });

  if (response?.ok !== true) {
    throw new Error(
      response?.message ||
        response?.error ||
        'Le serveur n’a pas confirmé l’enregistrement FCM.',
    );
  }

  console.log('[FCM] Appareil enregistré en base.');

  return registration;
}

// Écoute les notifications lorsque l'application est ouverte.
export function listenForPush(onMessage) {
  if (typeof onMessage !== 'function') {
    throw new Error(
      'Un callback est nécessaire pour écouter les notifications.',
    );
  }

  return messaging().onMessage(async remoteMessage => {
    onMessage(remoteMessage);
  });
}
