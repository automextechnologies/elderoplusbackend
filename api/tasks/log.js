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
    const { dayNumber, taskId, amount, unit, completed, date } = req.body;

    if (!dayNumber || !taskId) {
      return res.status(400).json({ error: 'dayNumber and taskId are required' });
    }

    const user = await User.findById(userId).populate('batchId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const start = user.batchId ? user.batchId.startDate : user.startDate;
    const isStarted = user.batchId ? true : (user.challengeStarted || (start && new Date(start) <= new Date()));
    if (!isStarted) {
      return res.status(400).json({ error: 'Challenge has not started yet' });
    }

    if (start) {
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      if (new Date() < startDate) {
        return res.status(400).json({ error: 'Challenge has not started yet' });
      }
    }

    // Sleep-based next-day unlock logic:
    // Day d > 1 requires Day d - 1 Sleep Task to be completed
    const numDay = Number(dayNumber);
    if (numDay > 1) {
      for (let prev = 1; prev < numDay; prev++) {
        const prevSleep = await TaskLog.findOne({
          userId,
          dayNumber: prev,
          taskId: 'sleep',
          $or: [{ completed: true }, { amount: { $gt: 0 } }],
        });
        if (!prevSleep) {
          return res.status(400).json({
            error: "Complete your previous day's Sleep Task to unlock today's tasks.",
          });
        }
      }
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

    const log = await TaskLog.findOneAndUpdate(
      { userId, dayNumber: numDay, taskId },
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
