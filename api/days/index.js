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

    const REQUIRED = ['yoga', 'meditation', 'water', 'protein'];
    const now = new Date();
    const startDate = new Date(user.batchId ? user.batchId.startDate : user.startDate);

    const days = Array.from({ length: 30 }, (_, i) => {
      const dayNumber = i + 1;
      const unlockDate = new Date(startDate);
      unlockDate.setDate(unlockDate.getDate() + i);
      unlockDate.setHours(1, 0, 0, 0);

      const isUnlocked = unlockDate <= now;
      const isToday =
        formatDate(unlockDate) === formatDate(now) ||
        (dayNumber === 1 && i === 0);

      const dayLogs = logs.filter((l) => l.dayNumber === dayNumber);
      const completedTasks = dayLogs.filter((l) => l.completed).map((l) => l.taskId);
      const requiredDone = REQUIRED.filter((t) => completedTasks.includes(t)).length;
      const allDone = REQUIRED.every((t) => completedTasks.includes(t));

      let status = 'locked';
      if (isUnlocked) {
        if (isToday) {
          status = allDone ? 'complete' : requiredDone > 0 ? 'partial' : 'today';
        } else if (unlockDate < now) {
          status = allDone ? 'complete' : requiredDone > 0 ? 'partial' : 'missed';
        } else {
          status = 'unlocked';
        }
      }

      return {
        dayNumber,
        unlockDate: unlockDate.toISOString(),
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
