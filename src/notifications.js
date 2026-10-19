
import {Platform, PermissionsAndroid} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {api} from './api';

export async function registerPushNotifications() {
  try {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return null;
    }
    await messaging().requestPermission();
    const token = await messaging().getToken();
    if (token) await api('/api/auth/fcm-token', {method:'POST', body:JSON.stringify({token})});
    return token;
  } catch (error) {
    console.warn('FCM non configuré ou permission refusée:', error.message);
    return null;
  }
}

export function listenForPush(onNotification) {
  const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
    onNotification?.(remoteMessage);
  });
  const unsubscribeOpened = messaging().onNotificationOpenedApp(remoteMessage => {
    onNotification?.(remoteMessage);
  });
  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage) onNotification?.(remoteMessage);
  });
  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
  };
}
