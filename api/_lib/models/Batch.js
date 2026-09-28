import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  startDate:       { type: Date, required: true },
  meetingName:     { type: String, default: 'Daily Live Session' },
  meetingLink:     { type: String, default: '' },
  meetingTime:     { type: String, default: '09:00' }, // HH:mm 24-hour format
  meetingDuration: { type: Number, default: 60 },      // Duration in minutes
}, { timestamps: true });

export default mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
