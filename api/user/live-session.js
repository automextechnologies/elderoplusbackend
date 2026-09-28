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

    if (req.method === 'GET') {
      const user = await User.findById(userId).populate('batchId');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.batchId) {
        return res.status(200).json({
          hasMeeting: false,
          hasBatch: false,
          message: 'No batch assigned to this account.',
        });
      }

      const batch = user.batchId;
      return res.status(200).json({
        hasMeeting: Boolean(batch.meetingLink && batch.meetingLink.trim()),
        hasBatch: true,
        batchId: batch._id,
        batchName: batch.name,
        startDate: batch.startDate,
        meetingName: batch.meetingName || 'Daily Live Session',
        meetingLink: batch.meetingLink || '',
        meetingTime: batch.meetingTime || '09:00',
        meetingDuration: batch.meetingDuration || 60,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[user/live-session]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
