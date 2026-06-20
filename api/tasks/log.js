import { connectDB } from '../_lib/mongodb.js';
import TaskLog from '../_lib/models/TaskLog.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const { dayNumber, taskId, amount, unit, completed, forDay, date } = req.body;

    if (!dayNumber || !taskId) {
      return res.status(400).json({ error: 'dayNumber and taskId are required' });
    }

    const user = await User.findById(userId).populate('batchId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const startDate = new Date(user.batchId ? user.batchId.startDate : user.startDate);
    const unlockDate = new Date(startDate);
    unlockDate.setDate(unlockDate.getDate() + (dayNumber - 1));
    unlockDate.setHours(1, 0, 0, 0);

    if (new Date() < unlockDate) {
      return res.status(400).json({ error: `Day ${dayNumber} is locked` });
    }

    const updateDoc = {
      $set: {
        completed: completed !== undefined ? completed : true,
        amount: amount || 0,
        unit: unit || '',
        completedAt: new Date(),
        date: date || formatDate(new Date()),
      },
    };

    if (taskId === 'sleep' && forDay) {
      updateDoc.$set.forDay = forDay;
    }

    const log = await TaskLog.findOneAndUpdate(
      { userId, dayNumber, taskId },
      updateDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ log });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[tasks/log]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
