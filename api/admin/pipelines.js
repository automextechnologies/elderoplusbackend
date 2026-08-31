import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Pipeline from '../_lib/models/Pipeline.js';
import PipelineStage from '../_lib/models/PipelineStage.js';
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

    // 1. GET (List all pipelines)
    if (req.method === 'GET') {
      const pipelines = await Pipeline.find().sort({ order: 1 });
      return res.status(200).json({ pipelines });
    }

    // 2. POST (Create new pipeline)
    if (req.method === 'POST') {
      const { name, order } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Pipeline name is required' });
      }

      let finalOrder = order;
      if (typeof finalOrder !== 'number') {
        const count = await Pipeline.countDocuments();
        finalOrder = count;
      }

      const pipeline = await Pipeline.create({
        name,
        order: finalOrder,
      });

      return res.status(201).json({ pipeline });
    }

    // 3. PUT (Update / Reorder pipeline)
    if (req.method === 'PUT') {
      const { id, name, order, bulkReorder } = req.body;

      // Handle bulk reordering (array of { id, order })
      if (bulkReorder && Array.isArray(bulkReorder)) {
        for (const item of bulkReorder) {
          if (item.id && typeof item.order === 'number') {
            await Pipeline.findByIdAndUpdate(item.id, { order: item.order });
          }
        }
        const pipelines = await Pipeline.find().sort({ order: 1 });
        return res.status(200).json({ pipelines });
      }

      if (!id) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
      }

      const pipelineToUpdate = await Pipeline.findById(id);
      if (!pipelineToUpdate) {
        return res.status(404).json({ error: 'Pipeline not found' });
      }

      if (name) pipelineToUpdate.name = name;
      if (typeof order === 'number') pipelineToUpdate.order = order;

      await pipelineToUpdate.save();
      return res.status(200).json({ pipeline: pipelineToUpdate });
    }

    // 4. DELETE (Delete pipeline and its stages, clear users)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
      }

      const pipelineToDelete = await Pipeline.findById(id);
      if (!pipelineToDelete) {
        return res.status(404).json({ error: 'Pipeline not found' });
      }

      // Delete stages in this pipeline
      await PipelineStage.deleteMany({ pipelineId: id });

      // Clear pipeline association for users
      await User.updateMany(
        { pipelineId: id },
        { $set: { pipelineId: null, currentStageId: null, pipelineStages: [] } }
      );

      // Delete the pipeline itself
      await Pipeline.deleteOne({ _id: id });

      // Clean up order numbers for remaining pipelines
      const remainingPipelines = await Pipeline.find().sort({ order: 1 });
      for (let i = 0; i < remainingPipelines.length; i++) {
        remainingPipelines[i].order = i;
        await remainingPipelines[i].save();
      }

      return res.status(200).json({ message: 'Pipeline, stages, and customer links deleted and order rebuilt successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[pipelines]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
