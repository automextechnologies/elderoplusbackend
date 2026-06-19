import webpush from 'web-push';

let vapidInitialized = false;

function ensureVapidDetails() {
  if (!vapidInitialized) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidInitialized = true;
  }
}

export async function sendPush(subscription, payload) {
  try {
    ensureVapidDetails();
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    if (err.statusCode === 410) {
      return { success: false, expired: true };
    }
    throw err;
  }
}
