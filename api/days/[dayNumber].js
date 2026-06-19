import { connectDB } from '../_lib/mongodb.js';
import TaskLog from '../_lib/models/TaskLog.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const dayNumber = parseInt(req.query.dayNumber, 10);

    if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 30) {
      return res.status(400).json({ error: 'Invalid day number' });
    }

    const logs = await TaskLog.find({ userId, dayNumber });
    return res.status(200).json({ logs, dayNumber });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[days/dayNumber]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
