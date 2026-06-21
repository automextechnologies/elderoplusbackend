import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { sendPush } from '../_lib/webpush.js';
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
    const notificationText = message || 'This is a test push notification from the Eldro+ Admin Panel.';

    // Find all customers who have a push subscription
    const customers = await User.find({
      role: 'customer',
      pushSubscription: { $ne: null }
    });

    let successCount = 0;
    let expiredCount = 0;

    const payload = {
      title: 'Eldro+ Live Test',
      body: notificationText,
      icon: '/pwa-192x192.png',
      badge: '/badge-72x72.png',
      tag: 'admin-test-push',
      data: { url: '/' }
    };

    for (const customer of customers) {
      try {
        const result = await sendPush(customer.pushSubscription, payload);
        if (result.success) {
          successCount++;
        } else if (result.expired) {
          expiredCount++;
          // Clean up expired subscription
          await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
        }
      } catch (err) {
        console.error(`Failed to send test push to user ${customer._id}:`, err);
        // If statusCode is 410 or 404, we clean it up too
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredCount++;
          await User.findByIdAndUpdate(customer._id, { pushSubscription: null });
        }
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
