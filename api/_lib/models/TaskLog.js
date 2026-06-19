import mongoose from 'mongoose';

const TaskLogSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dayNumber:   { type: Number, required: true, min: 1, max: 30 },
  date:        { type: String, required: true },
  taskId:      { type: String, required: true, enum: ['yoga', 'meditation', 'water', 'protein', 'sleep'] },
  completed:   { type: Boolean, default: false },
  amount:      { type: Number, default: 0 },
  unit:        { type: String, default: '' },
  completedAt: { type: Date },
  forDay:      { type: Number },
}, { timestamps: true });

TaskLogSchema.index({ userId: 1, dayNumber: 1, taskId: 1 }, { unique: true });

export default mongoose.models.TaskLog || mongoose.model('TaskLog', TaskLogSchema);
