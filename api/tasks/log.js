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

    const startDate = new Date(start || Date.now());
    startDate.setHours(0, 0, 0, 0);

    const now = new Date();
    if (now < startDate) {
      return res.status(400).json({ error: 'Challenge has not started yet' });
    }

    const numDay = Number(dayNumber);
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + (numDay - 1));
    dayDate.setHours(0, 0, 0, 0);

    // Day 1 unlocks at startDate 00:00:00; Day 2+ unlocks at 03:00:00 on dayDate
    const dayUnlockTime = numDay === 1 ? new Date(startDate) : new Date(dayDate);
    if (numDay > 1) {
      dayUnlockTime.setHours(3, 0, 0, 0);
    }

    // Normal tasks lock at 1:00 AM on the day after dayDate
    const nextDay = new Date(dayDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const normalTasksLockTime = new Date(nextDay);
    normalTasksLockTime.setHours(1, 0, 0, 0);

    // Sleep task unlocks at 3:00 AM on nextDay
    const sleepUnlockTime = new Date(nextDay);
    sleepUnlockTime.setHours(3, 0, 0, 0);

    if (taskId !== 'sleep') {
      // Normal tasks: must be unlocked and not yet reached 1:00 AM lock
      if (now < dayUnlockTime) {
        return res.status(400).json({ error: `Day ${numDay} is not unlocked yet.` });
      }
      if (now >= normalTasksLockTime) {
        return res.status(400).json({ error: `Normal tasks for Day ${numDay} locked at 1:00 AM.` });
      }
    } else {
      // Sleep task: unlocks at 3:00 AM on nextDay
      if (now < sleepUnlockTime) {
        return res.status(400).json({ error: `Sleep task for Day ${numDay} unlocks at 3:00 AM on Day ${numDay + 1}.` });
      }

      // If already completed, lock and prevent further editing
      const existingSleep = await TaskLog.findOne({
        userId,
        dayNumber: numDay,
        taskId: 'sleep',
        $or: [{ completed: true }, { amount: { $gt: 0 } }],
      });
      if (existingSleep) {
        return res.status(400).json({ error: `Sleep task for Day ${numDay} has already been completed and is locked.` });
      }
    }

    const isTaskDone = completed !== undefined ? completed : (Number(amount) > 0);
    const updateDoc = {
      $set: {
        completed: isTaskDone,
        amount: Number(amount) || 0,
        unit: unit || '',
        completedAt: new Date(),
        date: date || formatDate(dayDate),
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

