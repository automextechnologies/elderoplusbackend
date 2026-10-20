import webpush from 'web-push';

let vapidInitialized = false;

function ensureVapidDetails() {
  if (!vapidInitialized) {
    const email = process.env.VAPID_EMAIL;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!email || !publicKey || !privateKey) {
      return false;
    }

    try {
      webpush.setVapidDetails(email, publicKey, privateKey);
      vapidInitialized = true;
    } catch (err) {
      console.warn('[webpush] Failed to set VAPID details:', err.message);
      return false;
    }
  }
  return vapidInitialized;
}

export async function sendPush(subscription, payload) {
  try {
    if (!ensureVapidDetails()) {
      return { success: false, reason: 'vapid_not_configured' };
    }
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { success: false, expired: true };
    }
    throw err;
  }
}
