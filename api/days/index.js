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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const user = await User.findById(userId).populate('batchId').select('startDate batchId');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const logs = await TaskLog.find({ userId }).sort({ dayNumber: 1 });

    const REQUIRED = ['yoga', 'meditation', 'water', 'sleep'];
    const now = new Date();
    const startDate = new Date(user.batchId ? user.batchId.startDate : user.startDate);
    startDate.setHours(0, 0, 0, 0);

    const isChallengeStarted = startDate <= now;

    function getDayUnlockTime(dNum) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + (dNum - 1));
      if (dNum === 1) {
        return d;
      }
      d.setHours(3, 0, 0, 0);
      return d;
    }

    function isDayAccessible(dNum) {
      if (!isChallengeStarted) return false;
      const unlockTime = getDayUnlockTime(dNum);
      return now >= unlockTime;
    }

    const days = Array.from({ length: 30 }, (_, i) => {
      const dayNumber = i + 1;
      const dayUnlockTime = getDayUnlockTime(dayNumber);

      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);

      const isUnlocked = isDayAccessible(dayNumber);
      const isToday = isUnlocked && formatDate(dayDate) === formatDate(now);

      const dayLogs = logs.filter((l) => l.dayNumber === dayNumber);
      const completedTasks = dayLogs.filter((l) => l.completed || l.amount > 0).map((l) => l.taskId);
      const requiredDone = REQUIRED.filter((t) => completedTasks.includes(t)).length;
      const allDone = REQUIRED.every((t) => completedTasks.includes(t));

      let status = 'locked';
      if (isUnlocked) {
        if (allDone) {
          status = 'complete';
        } else if (isToday) {
          status = requiredDone > 0 ? 'partial' : 'today';
        } else if (dayUnlockTime < now) {
          status = requiredDone > 0 ? 'partial' : 'missed';
        } else {
          status = 'unlocked';
        }
      }

      return {
        dayNumber,
        unlockDate: dayUnlockTime.toISOString(),
        status,
        tasksCompleted: completedTasks.length,
        requiredDone,
        isToday,
      };
    });

    return res.status(200).json({ days, startDate });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[days/index]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
