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
  packageId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
  salesRepId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SalesRep', default: null },
  challengeStarted: { type: Boolean, default: false },
  fcmToken:        { type: String, default: null },
  lastWaterNotificationSent: { type: Date, default: null },
  pushSubscription:  { type: mongoose.Schema.Types.Mixed, default: null },
  pipelineStages:  [{
    stageId:     { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineStage' },
    name:        { type: String },
    completed:   { type: Boolean, default: false },
    completedAt: { type: Date },
  }],
  pipelineId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', default: null },
  currentStageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineStage', default: null },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
