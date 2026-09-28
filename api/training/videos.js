import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Video from '../_lib/models/Video.js';
import VideoCategory from '../_lib/models/VideoCategory.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

// Helper to extract YouTube video ID from various URL formats
export function getYouTubeId(url = '') {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  return match ? match[1] : null;
}

export const STARTER_VIDEOS = [
  {
    title: 'Gentle Morning Chair Yoga for Seniors',
    url: 'https://www.youtube.com/watch?v=kFhG-ZzLNN4',
    category: 'Yoga & Mobility',
    description: 'A 15-minute gentle seated routine focusing on neck, spine, and hip mobility to wake up energized.',
    thumbnailUrl: 'https://img.youtube.com/vi/kFhG-ZzLNN4/hqdefault.jpg',
    duration: '15 min',
    order: 1,
  },
  {
    title: 'Deep Breathing & Mindfulness Meditation',
    url: 'https://www.youtube.com/watch?v=inpok4MKVLM',
    category: 'Meditation & Breathwork',
    description: 'Calming 10-minute guided mindfulness practice to reduce tension, clear the mind, and lower resting heart rate.',
    thumbnailUrl: 'https://img.youtube.com/vi/inpok4MKVLM/hqdefault.jpg',
    duration: '10 min',
    order: 2,
  },
  {
    title: 'Full Body Mobility & Joint Health Practice',
    url: 'https://www.youtube.com/watch?v=g_tea8ZNk5A',
    category: 'Yoga & Mobility',
    description: 'Carefully designed joint lubrication and stretching routine for knees, hips, and shoulders.',
    thumbnailUrl: 'https://img.youtube.com/vi/g_tea8ZNk5A/hqdefault.jpg',
    duration: '20 min',
    order: 3,
  },
  {
    title: 'Hydration & Nutrition Guidance for Healthy Aging',
    url: 'https://www.youtube.com/watch?v=9iMGFqMmUFs',
    category: 'Nutrition & Diet',
    description: 'Expert tips on maintaining adequate water intake throughout the day and meeting daily protein goals.',
    thumbnailUrl: 'https://img.youtube.com/vi/9iMGFqMmUFs/hqdefault.jpg',
    duration: '12 min',
    order: 4,
  },
  {
    title: 'Bedtime Relaxation & Deep Sleep Routine',
    url: 'https://www.youtube.com/watch?v=aEqlQvczMJQ',
    category: 'Daily Wellness',
    description: 'Unwind at night with soothing breathwork and tranquil visualization for 7-9 hours of restorative sleep.',
    thumbnailUrl: 'https://img.youtube.com/vi/aEqlQvczMJQ/hqdefault.jpg',
    duration: '15 min',
    order: 5,
  },
];

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Ensure fresh responses and prevent proxy/browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  await connectDB();

  try {
    // 1. GET: List videos with search and category filtering (NO AUTO-SEEDING)
    if (req.method === 'GET') {
      const { search, category } = req.query;

      const conditions = [{ isActive: true }];

      if (category && category.trim() && category.trim().toLowerCase() !== 'all') {
        const catTrim = category.trim();
        const escapedCat = catTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(catTrim);

        if (catTrim.toLowerCase() === 'uncategorized') {
          conditions.push({
            $or: [
              { category: { $regex: /^uncategorized$/i } },
              { categoryId: null },
              { category: '' },
            ],
          });
        } else {
          conditions.push({
            $or: [
              { category: { $regex: new RegExp(`^${escapedCat}$`, 'i') } },
              ...(isObjectId ? [{ categoryId: catTrim }] : []),
            ],
          });
        }
      }

      if (search && search.trim()) {
        const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedSearch, 'i');
        conditions.push({
          $or: [
            { title: regex },
            { description: regex },
            { category: regex },
          ],
        });
      }

      const finalQuery = conditions.length > 1 ? { $and: conditions } : conditions[0];
      const videos = await Video.find(finalQuery).sort({ order: 1, createdAt: -1 });

      return res.status(200).json({
        videos,
        total: videos.length,
      });
    }

    // For write operations, require admin authentication
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // Explicit manual seed action (ONLY triggered if admin explicitly clicks "Seed Defaults")
    if (req.method === 'POST' && req.query.action === 'seed') {
      const existingCount = await Video.countDocuments();
      if (existingCount === 0) {
        // Link starter videos to existing category IDs if categories exist
        const allCats = await VideoCategory.find();
        const catMap = new Map(allCats.map((c) => [c.name.toLowerCase(), c._id]));
        const prepared = STARTER_VIDEOS.map((v) => ({
          ...v,
          categoryId: catMap.get(v.category.toLowerCase()) || null,
        }));
        await Video.insertMany(prepared);
      }
      const allVids = await Video.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
      return res.status(200).json({
        message: 'Starter videos initialized successfully.',
        videos: allVids,
      });
    }

    // 2. POST: Upload / Add video link
    if (req.method === 'POST') {
      const { title, url, category, description, duration, thumbnailUrl } = req.body || {};

      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Video title is required.' });
      }
      if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Video URL link is required.' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ error: 'Video group / category is required.' });
      }

      const trimmedUrl = url.trim();
      let finalThumb = thumbnailUrl ? thumbnailUrl.trim() : '';

      // Auto-populate YouTube thumbnail if empty
      if (!finalThumb) {
        const ytId = getYouTubeId(trimmedUrl);
        if (ytId) {
          finalThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        }
      }

      // Find matching category by name or ID to attach categoryId
      const catTrim = category.trim();
      const escapedCat = catTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(catTrim);
      const catObj = await VideoCategory.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${escapedCat}$`, 'i') } },
          ...(isObjectId ? [{ _id: catTrim }] : []),
        ],
      });

      const newVideo = await Video.create({
        title: title.trim(),
        url: trimmedUrl,
        category: catObj ? catObj.name : catTrim,
        categoryId: catObj ? catObj._id : null,
        description: description ? description.trim() : '',
        duration: duration ? duration.trim() : '',
        thumbnailUrl: finalThumb,
      });

      return res.status(201).json({
        video: newVideo,
        message: 'Video added successfully.',
      });
    }

    // 3. PUT: Update video
    if (req.method === 'PUT') {
      const { id, title, url, category, description, duration, thumbnailUrl } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: 'Video ID is required.' });
      }
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Video title is required.' });
      }
      if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Video URL is required.' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ error: 'Video group / category is required.' });
      }

      const video = await Video.findById(id);
      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      const trimmedUrl = url.trim();
      let finalThumb = thumbnailUrl ? thumbnailUrl.trim() : '';
      if (!finalThumb) {
        const ytId = getYouTubeId(trimmedUrl);
        if (ytId) {
          finalThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        }
      }

      const catTrim = category.trim();
      const escapedCat = catTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(catTrim);
      const catObj = await VideoCategory.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${escapedCat}$`, 'i') } },
          ...(isObjectId ? [{ _id: catTrim }] : []),
        ],
      });

      video.title = title.trim();
      video.url = trimmedUrl;
      video.category = catObj ? catObj.name : catTrim;
      video.categoryId = catObj ? catObj._id : null;
      video.description = description ? description.trim() : '';
      video.duration = duration ? duration.trim() : '';
      video.thumbnailUrl = finalThumb;

      await video.save();

      return res.status(200).json({
        video,
        message: 'Video updated successfully.',
      });
    }

    // 4. DELETE: Permanently remove video
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Video ID is required.' });
      }

      const video = await Video.findById(id);
      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      await Video.deleteOne({ _id: id });
      return res.status(200).json({ message: 'Video deleted successfully.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[training/videos]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
