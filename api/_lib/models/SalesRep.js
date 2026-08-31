import mongoose from 'mongoose';

const SalesRepSchema = new mongoose.Schema({
  name: { type: String, required: true }
}, { timestamps: true });

export default mongoose.models.SalesRep || mongoose.model('SalesRep', SalesRepSchema);
