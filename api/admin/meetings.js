import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Batch from '../_lib/models/Batch.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    if (req.method === 'GET') {
      const batches = await Batch.find().sort({ startDate: -1, createdAt: -1 });

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const batchesWithMeetingData = await Promise.all(
        batches.map(async (b) => {
          const count = await User.countDocuments({ batchId: b._id, role: 'customer' });
          const start = new Date(b.startDate);
          start.setHours(0, 0, 0, 0);

          const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
          const currentDayNumber = Math.max(1, Math.min(diffDays + 1, 30));
          const isRunning = diffDays >= 0 && diffDays < 30;
          const isUpcoming = diffDays < 0;
          const isEnded = diffDays >= 30;

          return {
            ...b.toObject(),
            meetingName: b.meetingName || 'Daily Live Session',
            meetingLink: b.meetingLink || '',
            meetingTime: b.meetingTime || '09:00',
            meetingDuration: b.meetingDuration || 60,
            customerCount: count,
            currentDayNumber,
            isRunning,
            isUpcoming,
            isEnded,
            daysPassed: diffDays >= 0 ? diffDays + 1 : 0,
          };
        })
      );

      return res.status(200).json({ batches: batchesWithMeetingData });
    }

    if (req.method === 'PUT') {
      const { batchId, meetingName, meetingLink, meetingTime, meetingDuration } = req.body;

      if (!batchId) {
        return res.status(400).json({ error: 'Batch ID is required' });
      }

      const batch = await Batch.findById(batchId);
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      if (meetingTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingTime)) {
        return res.status(400).json({ error: 'Invalid meeting time format. Expected HH:mm (24-hour).' });
      }

      const parsedDuration = Number(meetingDuration);
      if (meetingDuration !== undefined && (isNaN(parsedDuration) || parsedDuration <= 0)) {
        return res.status(400).json({ error: 'Meeting duration must be a positive number of minutes.' });
      }

      if (meetingName !== undefined) {
        batch.meetingName = meetingName.trim() || 'Daily Live Session';
      }
      if (meetingLink !== undefined) {
        batch.meetingLink = meetingLink.trim();
      }
      if (meetingTime !== undefined) {
        batch.meetingTime = meetingTime;
      }
      if (meetingDuration !== undefined) {
        batch.meetingDuration = parsedDuration;
      }

      await batch.save();

      const count = await User.countDocuments({ batchId: batch._id, role: 'customer' });
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const start = new Date(batch.startDate);
      start.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
      const currentDayNumber = Math.max(1, Math.min(diffDays + 1, 30));
      const isRunning = diffDays >= 0 && diffDays < 30;

      return res.status(200).json({
        batch: {
          ...batch.toObject(),
          meetingName: batch.meetingName || 'Daily Live Session',
          meetingLink: batch.meetingLink || '',
          meetingTime: batch.meetingTime || '09:00',
          meetingDuration: batch.meetingDuration || 60,
          customerCount: count,
          currentDayNumber,
          isRunning,
          isUpcoming: diffDays < 0,
          isEnded: diffDays >= 30,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin/meetings]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
