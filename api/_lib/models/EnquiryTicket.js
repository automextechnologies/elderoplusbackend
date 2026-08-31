import mongoose from 'mongoose';

const EnquiryTicketSchema = new mongoose.Schema({
  customerDetails: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  enquiry: { type: String, required: true },
  requestedConsultations: { type: String, default: '' },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['new ticket', 'waiting on consultation', 'completed'], default: 'new ticket' },
  createdDate: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.EnquiryTicket || mongoose.model('EnquiryTicket', EnquiryTicketSchema);
