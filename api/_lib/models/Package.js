import mongoose from 'mongoose';

const PackageSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  description: { type: String },
  items:       [{ type: String }],
  price:       { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.models.Package || mongoose.model('Package', PackageSchema);
