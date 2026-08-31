import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import NotificationConfig from '../_lib/models/NotificationConfig.js';
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
      const configs = await NotificationConfig.find().sort({ createdAt: -1 });
      return res.status(200).json({ configs });
    }

    if (req.method === 'POST') {
      const { title, body, type, fixedTime, intervalMinutes, category, targetUrl, isActive } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: 'Title and message body text areas are required' });
      }

      const config = await NotificationConfig.create({
        title,
        body,
        type: type || 'fixed',
        fixedTime: fixedTime || '08:00',
        intervalMinutes: intervalMinutes ? Number(intervalMinutes) : 120,
        category: category || 'general',
        targetUrl: targetUrl || '/',
        isActive: isActive !== undefined ? !!isActive : true,
      });

      return res.status(201).json({ config });
    }

    if (req.method === 'PUT') {
      const { id, title, body, type, fixedTime, intervalMinutes, category, targetUrl, isActive } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Configuration ID is required' });
      }

      const existing = await NotificationConfig.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      if (title !== undefined) existing.title = title;
      if (body !== undefined) existing.body = body;
      if (type !== undefined) existing.type = type;
      if (fixedTime !== undefined) existing.fixedTime = fixedTime;
      if (intervalMinutes !== undefined) existing.intervalMinutes = Number(intervalMinutes);
      if (category !== undefined) existing.category = category;
      if (targetUrl !== undefined) existing.targetUrl = targetUrl;
      if (isActive !== undefined) existing.isActive = !!isActive;

      await existing.save();
      return res.status(200).json({ config: existing });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Configuration ID is required' });
      }

      await NotificationConfig.findByIdAndDelete(id);
      return res.status(200).json({ success: true, message: 'Configuration deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin/push-config]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
