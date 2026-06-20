import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  phone:           { type: String, required: true, unique: true },
  passwordHash:    { type: String, required: true },
  role:            { type: String, enum: ['admin', 'customer'], default: 'customer' },
  age:             { type: Number },
  gender:          { type: String, enum: ['male', 'female', 'other'] },
  heightCm:        { type: Number },
  weightKg:        { type: Number },
  startDate:       { type: Date, default: Date.now },
  joinedDate:      { type: Date, default: Date.now },
  batchId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
  pushSubscription: { type: mongoose.Schema.Types.Mixed, default: null },
  notificationsSentToday: [{
    taskId: String,
    hour: Number,
    date: String,
  }],
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
