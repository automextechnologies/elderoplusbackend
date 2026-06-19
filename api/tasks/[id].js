import { connectDB } from '../_lib/mongodb.js';
import TaskLog from '../_lib/models/TaskLog.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const { id } = req.query;
    const { amount, unit, completed } = req.body;

    const log = await TaskLog.findOneAndUpdate(
      { _id: id, userId },
      { $set: { amount, unit, completed, completedAt: completed ? new Date() : undefined } },
      { new: true }
    );

    if (!log) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json({ log });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[tasks/id]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
