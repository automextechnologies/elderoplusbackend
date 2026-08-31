import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
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

    // 1. GET (List stages, optionally filtered by pipelineId)
    if (req.method === 'GET') {
      const { pipelineId } = req.query;
      const filter = pipelineId ? { pipelineId } : {};
      const stages = await PipelineStage.find(filter).sort({ order: 1 });
      return res.status(200).json({ stages });
    }

    // 2. POST (Create new stage in a pipeline)
    if (req.method === 'POST') {
      const { name, pipelineId, order } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Stage name is required' });
      }
      if (!pipelineId) {
        return res.status(400).json({ error: 'Pipeline ID is required' });
      }

      // If order is not specified, append to the end of the pipeline
      let finalOrder = order;
      if (typeof finalOrder !== 'number') {
        const count = await PipelineStage.countDocuments({ pipelineId });
        finalOrder = count;
      }

      const stage = await PipelineStage.create({
        name,
        pipelineId,
        order: finalOrder,
      });

      return res.status(201).json({ stage });
    }

    // 3. PUT (Update / Reorder stage)
    if (req.method === 'PUT') {
      const { id, name, order, bulkReorder, pipelineId } = req.body;

      // Handle bulk reordering (array of { id, order })
      if (bulkReorder && Array.isArray(bulkReorder)) {
        for (const item of bulkReorder) {
          if (item.id && typeof item.order === 'number') {
            await PipelineStage.findByIdAndUpdate(item.id, { order: item.order });
          }
        }
        const filter = pipelineId ? { pipelineId } : {};
        const stages = await PipelineStage.find(filter).sort({ order: 1 });
        return res.status(200).json({ stages });
      }

      if (!id) {
        return res.status(400).json({ error: 'Stage ID is required' });
      }

      const stageToUpdate = await PipelineStage.findById(id);
      if (!stageToUpdate) {
        return res.status(404).json({ error: 'Pipeline stage not found' });
      }

      if (name) stageToUpdate.name = name;
      if (typeof order === 'number') stageToUpdate.order = order;
      if (pipelineId) stageToUpdate.pipelineId = pipelineId;

      await stageToUpdate.save();
      return res.status(200).json({ stage: stageToUpdate });
    }

    // 4. DELETE (Delete stage and clean up user references)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Stage ID is required' });
      }

      const stageToDelete = await PipelineStage.findById(id);
      if (!stageToDelete) {
        return res.status(404).json({ error: 'Pipeline stage not found' });
      }

      const parentPipelineId = stageToDelete.pipelineId;

      // Clean up users referencing this stage
      await User.updateMany(
        { currentStageId: id },
        { $set: { currentStageId: null }, $pull: { pipelineStages: { stageId: id } } }
      );

      await PipelineStage.deleteOne({ _id: id });

      // Clean up order numbers for remaining stages in this pipeline
      const remainingStages = await PipelineStage.find({ pipelineId: parentPipelineId }).sort({ order: 1 });
      for (let i = 0; i < remainingStages.length; i++) {
        remainingStages[i].order = i;
        await remainingStages[i].save();
      }

      return res.status(200).json({ message: 'Pipeline stage deleted and order rebuilt successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[pipeline-stages]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
