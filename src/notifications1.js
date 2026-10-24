
import {
  Platform,
  PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import {api} from './api';

const INSTALLATION_KEY = '@fastfood_one_installation_id';

async function getInstallationId() {
  let id = await AsyncStorage.getItem(INSTALLATION_KEY);

  if (!id) {
    id = `android-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 14)}`;

    await AsyncStorage.setItem(INSTALLATION_KEY, id);
  }

  return id;
}

export async function registerPushNotifications() {
  try {
    if (
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 33
    ) {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[FCM] Permission de notification refusée.');
        return null;
      }
    }

    const token = await messaging().getToken();

    if (!token) {
      throw new Error('Aucun token FCM reçu.');
    }

    const installationId = await getInstallationId();

    const result = await api('/api/auth/fcm-token', {
      method: 'POST',
      body: JSON.stringify({
        token,
        installationId,
        platform: Platform.OS,
        deviceLabel: `${Platform.OS} FastFood One`,
      }),
    });

    if (!result?.ok) {
      throw new Error('Le serveur n’a pas confirmé l’enregistrement.');
    }

    console.log('[FCM] Appareil enregistré dans user_devices.');
    return token;
  } catch (error) {
    console.warn(
      '[FCM] Échec de l’enregistrement :',
      error?.message || error,
    );
    return null;
  }
}

export function listenForPush(onNotification) {
  const unsubscribeForeground = messaging().onMessage(
    async message => {
      onNotification?.(message);
    },
  );

  const unsubscribeOpened = messaging().onNotificationOpenedApp(
    message => {
      onNotification?.(message);
    },
  );

  messaging()
    .getInitialNotification()
    .then(message => {
      if (message) {
        onNotification?.(message);
      }
    })
    .catch(error => {
      console.warn('[FCM] Notification initiale :', error?.message);
    });

  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
  };
}
