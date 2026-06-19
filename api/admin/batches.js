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
      const batches = await Batch.find().sort({ createdAt: -1 });
      const batchesWithCount = await Promise.all(batches.map(async (b) => {
        const count = await User.countDocuments({ batchId: b._id, role: 'customer' });
        return {
          ...b.toObject(),
          customerCount: count
        };
      }));
      return res.status(200).json({ batches: batchesWithCount });
    }

    if (req.method === 'POST') {
      const { name, startDate } = req.body;
      if (!name || !startDate) {
        return res.status(400).json({ error: 'Batch Name and Start Date are required' });
      }

      const newBatch = await Batch.create({
        name,
        startDate: new Date(startDate)
      });
      
      return res.status(201).json({ batch: { ...newBatch.toObject(), customerCount: 0 } });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[batches]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
