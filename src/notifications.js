import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMessaging,
  getToken,
  onMessage,
} from '@react-native-firebase/messaging';

import {api} from './api';

const INSTALLATION_KEY = '@fastfood_one_installation_id';

function logFcmError(step, error) {
  console.error(`[FCM][${step}]`, {
    code: error?.code || 'UNKNOWN',
    message: error?.message || String(error),
    stack: error?.stack || null,
  });
}

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

/**
 * Génère le token FCM sans demander la permission
 * d'afficher les notifications Android.
 */
export async function preparePushRegistration() {
  try {
    console.log('[FCM][1] Initialisation Firebase Messaging');

    const messagingInstance = getMessaging();

    if (!messagingInstance) {
      throw new Error(
        'Firebase Messaging ne fournit aucune instance.',
      );
    }

    console.log('[FCM][2] Demande du token FCM');

    const token = await getToken(messagingInstance);

    if (
      typeof token !== 'string' ||
      token.trim().length < 20
    ) {
      throw new Error(
        'Firebase a renvoyé un token FCM vide ou invalide.',
      );
    }

    const installationId = await getInstallationId();

    const registration = {
      token: token.trim(),
      installationId,
      platform: Platform.OS,
      deviceLabel: `${Platform.OS} FastFood One`,
    };

    console.log('[FCM][3] Token obtenu', {
      platform: registration.platform,
      tokenLength: registration.token.length,
      installationId: registration.installationId,
    });

    return registration;
  } catch (error) {
    logFcmError('GENERATION', error);
    throw error;
  }
}

/**
 * Enregistrement d'un appareil après connexion.
 */
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
        'Le serveur n’a pas confirmé le token FCM.',
    );
  }

  console.log('[FCM] Token enregistré sur le serveur.');

  return registration;
}

/**
 * Écoute des notifications reçues lorsque l'application
 * est au premier plan.
 */
export function listenForPush(onNotification) {
  if (typeof onNotification !== 'function') {
    throw new Error('Le callback de notification est invalide.');
  }

  return onMessage(getMessaging(), onNotification);
}