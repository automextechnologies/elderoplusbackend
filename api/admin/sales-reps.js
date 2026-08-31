import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import SalesRep from '../_lib/models/SalesRep.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    // 1. Authorize requesting user is an admin
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 2. Handle GET (List sales reps)
    if (req.method === 'GET') {
      const salesReps = await SalesRep.find().sort({ name: 1 });
      return res.status(200).json({ salesReps });
    }

    // 3. Handle POST (Create sales rep)
    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const salesRep = await SalesRep.create({ name });
      return res.status(201).json({ salesRep });
    }

    // 4. Handle PUT (Update sales rep)
    if (req.method === 'PUT') {
      const { id, name } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'ID and name are required' });
      }

      const salesRep = await SalesRep.findByIdAndUpdate(id, { name }, { new: true });
      if (!salesRep) {
        return res.status(404).json({ error: 'Sales representative not found' });
      }

      return res.status(200).json({ salesRep });
    }

    // 5. Handle DELETE (Delete sales rep)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'ID is required' });
      }

      const salesRep = await SalesRep.findById(id);
      if (!salesRep) {
        return res.status(404).json({ error: 'Sales representative not found' });
      }

      // Update customers who have this sales rep assigned
      await User.updateMany({ salesRepId: id }, { salesRepId: null });

      // Delete the sales rep
      await SalesRep.deleteOne({ _id: id });

      return res.status(200).json({ message: 'Sales representative deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin-sales-reps]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
