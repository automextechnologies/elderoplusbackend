import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    const { userId } = verifyToken(req);

    if (req.method === 'GET') {
      const user = await User.findById(userId).select('-passwordHash -pushSubscription');
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ user });
    }

    if (req.method === 'PUT') {
      const { name, age, gender, heightCm, weightKg } = req.body;
      const updated = await User.findByIdAndUpdate(
        userId,
        { $set: { name, age, gender, heightCm, weightKg } },
        { new: true }
      ).select('-passwordHash -pushSubscription');
      return res.status(200).json({ user: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[profile]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
