import mongoose from 'mongoose';

const PipelineStageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', required: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.models.PipelineStage || mongoose.model('PipelineStage', PipelineStageSchema);
