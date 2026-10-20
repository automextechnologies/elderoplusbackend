import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { sendPush } from '../_lib/webpush.js';
import { firebaseAdmin } from '../_lib/firebase.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    const { message } = req.body;
    const notificationText = message || 'This is a test push notification from the eldroplus Admin Panel.';

    // Find all customers who have an FCM token or push subscription
    const customers = await User.find({
      role: 'customer',
      $or: [
        { pushSubscription: { $ne: null } },
        { fcmToken: { $ne: null } }
      ]
    });

    let successCount = 0;
    let expiredCount = 0;

    const payload = {
      title: 'eldroplus Live Test',
      body: notificationText,
      icon: '/pwa-192x192.png',
      badge: '/badge-72x72.png',
      tag: `admin-test-push-${Date.now()}`,
      data: { url: '/' }
    };

    for (const customer of customers) {
      let sentToCustomer = false;

      // 1. Firebase Messaging (FCM) Delivery
      if (customer.fcmToken && firebaseAdmin) {
        try {
          await firebaseAdmin.messaging().send({
            token: customer.fcmToken,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            webpush: {
              notification: {
                title: payload.title,
                body: payload.body,
                icon: payload.icon,
                badge: payload.badge,
              },
              fcmOptions: {
                link: payload.data.url
              }
            },
            data: {
              url: payload.data.url,
            }
          });
          sentToCustomer = true;
        } catch (fcmErr) {
          console.error(`Failed to send FCM test push to user ${customer._id}:`, fcmErr.message);
          if (
            fcmErr.code === 'messaging/invalid-registration-token' ||
            fcmErr.code === 'messaging/registration-token-not-registered'
          ) {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { fcmToken: null });
          }
        }
      }

      // 2. WebPush Delivery (if present)
      if (customer.pushSubscription) {
        try {
          const result = await sendPush(customer.pushSubscription, payload);
          if (result.success) {
            sentToCustomer = true;
          } else if (result.expired) {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
          }
        } catch (err) {
          console.error(`Failed to send webpush test push to user ${customer._id}:`, err);
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
          }
        }
      }

      if (sentToCustomer) {
        successCount++;
      }
    }

    return res.status(200).json({
      success: true,
      totalSubscribers: customers.length,
      sent: successCount,
      expired: expiredCount
    });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin/test-notification]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
