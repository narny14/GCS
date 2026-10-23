// Exemple React Native CLI JavaScript. À intégrer au code existant, pas à remplacer App.js.
// Dépendances : @react-native-firebase/messaging et @react-native-async-storage/async-storage.
// api(path, options) doit ajouter le Bearer token du compte connecté.
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
const KEY='fastfood_installation_id';
const makeId=()=>`ff1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
export async function getInstallationId(){let id=await AsyncStorage.getItem(KEY);if(!id){id=makeId();await AsyncStorage.setItem(KEY,id);}return id;}
export async function registerFcmDevice(api,deviceLabel=null){
 const status=await messaging().requestPermission();
 const allowed=status===messaging.AuthorizationStatus.AUTHORIZED||status===messaging.AuthorizationStatus.PROVISIONAL;
 if(!allowed)return {ok:false,reason:'permission_denied'};
 const token=await messaging().getToken(),installationId=await getInstallationId();
 await api('/api/notifications/device',{method:'POST',body:JSON.stringify({installationId,token,platform:Platform.OS,deviceLabel})});return {ok:true,installationId};
}
export function listenForFcmTokenRefresh(api){return messaging().onTokenRefresh(async token=>{const installationId=await getInstallationId();await api('/api/notifications/device',{method:'POST',body:JSON.stringify({installationId,token,platform:Platform.OS})});});}
export function unregisterFcmDevice(api){return getInstallationId().then(id=>api(`/api/notifications/device/${encodeURIComponent(id)}`,{method:'DELETE'}));}
export function listenForForegroundNotifications(onNotification){return messaging().onMessage(message=>onNotification({title:message.notification?.title||'FastFood One',body:message.notification?.body||'',data:message.data||{}}));}
// Appeler une fois au démarrage, hors composant React :
export function registerBackgroundNotificationHandler(){messaging().setBackgroundMessageHandler(async message=>{ /* traitement discret; pas d'UI ici */ });}
