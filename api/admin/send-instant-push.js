import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { sendPush } from '../_lib/webpush.js';
import { handleCors } from '../_lib/cors.js';
import { firebaseAdmin } from '../_lib/firebase.js';

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

    const { title, body, category, targetUrl } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and message text are required' });
    }

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
      title: title || 'eldroplus Alert',
      body: body,
      icon: '/pwa-192x192.png',
      badge: '/badge-72x72.png',
      tag: `broadcast-${Date.now()}`,
      data: { url: targetUrl || '/', category: category || 'general' }
    };

    for (const customer of customers) {
      let sentToUser = false;

      // 1. WebPush Delivery
      if (customer.pushSubscription) {
        try {
          const result = await sendPush(customer.pushSubscription, payload);
          if (result.success) {
            sentToUser = true;
          } else if (result.expired) {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
          }
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
          }
        }
      }

      // 2. Firebase Messaging (FCM) Delivery
      if (customer.fcmToken && firebaseAdmin) {
        try {
          await firebaseAdmin.messaging().send({
            token: customer.fcmToken,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              url: payload.data.url,
              category: payload.data.category
            }
          });
          sentToUser = true;
        } catch (fcmErr) {
          if (fcmErr.code === 'messaging/invalid-registration-token' ||
              fcmErr.code === 'messaging/registration-token-not-registered') {
            expiredCount++;
            await User.findByIdAndUpdate(customer._id, { fcmToken: null });
          }
        }
      }

      if (sentToUser) successCount++;
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
    console.error('[admin/send-instant-push]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
