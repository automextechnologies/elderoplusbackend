import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import TaskLog from '../_lib/models/TaskLog.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    const { userId: requesterId } = verifyToken(req);
    const requestingUser = await User.findById(requesterId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    if (req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const user = await User.findById(userId).populate('batchId').select('-passwordHash');
      if (!user) return res.status(404).json({ error: 'Customer not found' });

      const logs = await TaskLog.find({ userId }).sort({ dayNumber: 1 });
      return res.status(200).json({ logs, user });
    }

    if (req.method === 'PUT') {
      const { userId, dayNumber, taskId, completed, amount } = req.body;
      if (!userId || !dayNumber || !taskId) {
        return res.status(400).json({ error: 'userId, dayNumber, and taskId are required' });
      }

      const user = await User.findById(userId).populate('batchId');
      if (!user) return res.status(404).json({ error: 'Customer not found' });

      // Calculate the correct date for this day number relative to the challenge start date
      const start = new Date(user.batchId ? user.batchId.startDate : user.startDate);
      const logDate = new Date(start);
      logDate.setDate(start.getDate() + (dayNumber - 1));
      const dateStr = logDate.toISOString().split('T')[0];

      // Define default units based on taskId
      const unitMap = {
        water: 'ml',
        protein: 'g',
        yoga: 'min',
        meditation: 'min',
        sleep: 'hrs'
      };

      const log = await TaskLog.findOneAndUpdate(
        { userId, dayNumber, taskId },
        {
          $set: {
            completed,
            amount: Number(amount || 0),
            unit: unitMap[taskId] || '',
            date: dateStr,
            completedAt: completed ? new Date() : null,
          }
        },
        { new: true, upsert: true }
      );

      return res.status(200).json({ log });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[customer-tasks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
