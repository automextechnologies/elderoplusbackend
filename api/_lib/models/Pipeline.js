import mongoose from 'mongoose';

const PipelineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.models.Pipeline || mongoose.model('Pipeline', PipelineSchema);
