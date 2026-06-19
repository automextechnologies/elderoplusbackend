import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import TaskLog from '../_lib/models/TaskLog.js';
import { verifyToken } from '../_lib/auth.js';
import { sendPush } from '../_lib/webpush.js';
import { handleCors } from '../_lib/cors.js';

const SCHEDULE = [
  { taskId: 'yoga',       hour: 6,  min: 30, msg: '🧘 Good morning! Time for your yoga session.' },
  { taskId: 'meditation', hour: 7,  min: 0,  msg: '🧠 Start your day mindfully. Time to meditate.' },
  { taskId: 'sleep',      hour: 6,  min: 0,  msg: '🌅 Rise and shine! Wake up early to start your day with energy and log your sleep.' },
  { taskId: 'water',      hour: 8,  min: 0,  msg: '💧 Time to hydrate! Start your day with water.' },
  { taskId: 'water',      hour: 10, min: 0,  msg: '💧 Mid-morning water break. Stay hydrated!' },
  { taskId: 'water',      hour: 12, min: 0,  msg: '💧 Midday hydration check. How much have you had?' },
  { taskId: 'water',      hour: 14, min: 0,  msg: '💧 Afternoon reminder. Keep sipping water!' },
  { taskId: 'water',      hour: 16, min: 0,  msg: '💧 Afternoon water break. You\'re doing great!' },
  { taskId: 'water',      hour: 18, min: 0,  msg: '💧 Evening hydration reminder. Almost there!' },
  { taskId: 'water',      hour: 20, min: 0,  msg: '💧 Last water reminder for today. Stay hydrated!' },
  { taskId: 'water',      hour: 22, min: 0,  msg: '💧 Take a few sips of water before bed to stay hydrated through the night.' },
  { taskId: 'protein',    hour: 9,  min: 0,  msg: '🥩 Morning protein check. Make sure to include some protein in your breakfast!' },
  { taskId: 'protein',    hour: 13, min: 30, msg: '🥩 Lunchtime protein reminder. Add some lean protein to your lunch!' },
  { taskId: 'protein',    hour: 19, min: 30, msg: '🥩 Dinner protein reminder. Log your protein intake to reach your 60g goal today!' },
  { taskId: 'sleep',      hour: 22, min: 0,  msg: '😴 Time to wind down and prepare for bed. Sleep on time to wake up refreshed!' },
];

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function getDelayMs(now, hour, min) {
  const target = new Date(now);
  target.setHours(hour, min, 0, 0);
  return Math.max(0, target.getTime() - now.getTime());
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const user = await User.findById(userId);

    if (!user?.pushSubscription) {
      return res.status(200).json({ sent: 0, reason: 'no-subscription', futureReminders: [] });
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const todayDate = formatDate(now);

    const completedToday = await TaskLog.find({
      userId, date: todayDate, completed: true,
    }).distinct('taskId');

    const currentDayNumber = Math.floor((now - user.startDate) / (1000 * 60 * 60 * 24)) + 1;
    const dynamicSchedule = [...SCHEDULE];

    if (currentDayNumber > 0 && currentDayNumber % 7 === 0 && currentDayNumber <= 28) {
      dynamicSchedule.push({
        taskId: 'weekly_summary',
        hour: 9, min: 0,
        msg: `🎉 Amazing! You've completed Week ${currentDayNumber / 7} of your 30-Day Health Challenge! Keep it up!`
      });
    }

    const futureReminders = dynamicSchedule.filter((item) => {
      const isFuture = item.hour > currentHour || (item.hour === currentHour && item.min > currentMin);
      const taskDone = item.taskId !== 'water' && item.taskId !== 'sleep' && completedToday.includes(item.taskId);
      return isFuture && !taskDone;
    }).map((item) => ({
      ...item,
      delayMs: getDelayMs(now, item.hour, item.min),
    }));

    const missedReminders = dynamicSchedule.filter((item) => {
      const isPast = item.hour < currentHour || (item.hour === currentHour && item.min <= currentMin);
      const taskDone = completedToday.includes(item.taskId);
      
      const reminderTime = new Date(now);
      reminderTime.setHours(item.hour, item.min, 0, 0);
      const hoursAgo = (now.getTime() - reminderTime.getTime()) / (1000 * 60 * 60);
      const isRecent = hoursAgo <= 2;
      
      return isPast && !taskDone && (isRecent || item.taskId === 'water');
    });

    const sent = new Set();
    let sentCount = 0;

    for (const reminder of missedReminders) {
      const key = reminder.taskId === 'water' ? `water-${reminder.hour}` : reminder.taskId;
      if (sent.has(key)) continue;
      sent.add(key);

      const result = await sendPush(user.pushSubscription, {
        title: '30-Day Health Challenge',
        body: reminder.msg,
        icon: '/pwa-192x192.png',
        badge: '/badge-72x72.png',
        tag: `${reminder.taskId}-${todayDate}`,
        data: { taskId: reminder.taskId, url: '/' },
      });

      sentCount++;

      if (result.expired) {
        await User.findByIdAndUpdate(userId, { pushSubscription: null });
        break;
      }
    }

    return res.status(200).json({ sent: sentCount, futureReminders });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[notifications/schedule-today]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
