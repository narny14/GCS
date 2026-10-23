
import {Platform, PermissionsAndroid} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {api} from './api';

export async function registerPushNotifications() {
  try {
    if (
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 33
    ) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('Permission de notification refusée.');
        return null;
      }
    }

    const permission = await messaging().requestPermission();

    const authorized =
      permission === messaging.AuthorizationStatus.AUTHORIZED ||
      permission === messaging.AuthorizationStatus.PROVISIONAL;

    if (!authorized) {
      console.warn('Autorisation FCM refusée.');
      return null;
    }

    const token = await messaging().getToken();

    if (!token) {
      console.warn('Aucun token FCM reçu.');
      return null;
    }

    // Nécessite un JWT déjà sauvegardé par saveToken().
    const result = await api('/api/auth/fcm-token', {
      method: 'POST',
      body: JSON.stringify({token}),
    });

    if (!result?.ok) {
      throw new Error("Le serveur n'a pas confirmé l'enregistrement FCM.");
    }

    console.log('Token FCM enregistré pour le compte connecté.');
    return token;
  } catch (error) {
    console.warn(
      "Échec de l'enregistrement FCM :",
      error?.message || error,
    );
    return null;
  }
}

export function listenForPush(onNotification) {
  const unsubscribeForeground = messaging().onMessage(
    async remoteMessage => {
      onNotification?.(remoteMessage);
    },
  );

  const unsubscribeOpened = messaging().onNotificationOpenedApp(
    remoteMessage => {
      onNotification?.(remoteMessage);
    },
  );

  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) onNotification?.(remoteMessage);
    })
    .catch(error => {
      console.warn(
        'Erreur lors de la récupération de la notification initiale :',
        error?.message || error,
      );
    });

  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
  };
}
