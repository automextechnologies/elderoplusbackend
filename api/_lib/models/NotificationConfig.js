import mongoose from 'mongoose';

const NotificationConfigSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: { type: String, enum: ['fixed', 'interval'], default: 'fixed' },
  fixedTime: { type: String, default: '08:00' }, // 24-hr format "HH:mm"
  intervalMinutes: { type: Number, default: 120 }, // Minutes interval
  category: { type: String, default: 'general' },
  targetUrl: { type: String, default: '/' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'notification_configs' });

export default mongoose.models.NotificationConfig || mongoose.model('NotificationConfig', NotificationConfigSchema);
