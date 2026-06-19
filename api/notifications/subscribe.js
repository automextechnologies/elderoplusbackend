import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const { subscription } = req.body;

    if (!subscription) return res.status(400).json({ error: 'Subscription required' });

    await User.findByIdAndUpdate(userId, { pushSubscription: subscription });
    return res.status(200).json({ success: true });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[notifications/subscribe]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
