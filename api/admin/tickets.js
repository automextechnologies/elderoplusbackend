import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import EnquiryTicket from '../_lib/models/EnquiryTicket.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 1. GET (List all tickets)
    if (req.method === 'GET') {
      const tickets = await EnquiryTicket.find()
        .populate('customerDetails.userId', 'name phone email batchId')
        .sort({ createdDate: -1 });
      return res.status(200).json({ tickets });
    }

    // 2. POST (Create ticket)
    if (req.method === 'POST') {
      const { name, phone, email, enquiry, requestedConsultations, dueDate, status } = req.body;

      if (!name || !phone || !enquiry) {
        return res.status(400).json({ error: 'Customer name, phone, and enquiry text are required' });
      }

      // Try to find if user exists in the database
      const existingUser = await User.findOne({ phone, role: 'customer' });

      const ticket = await EnquiryTicket.create({
        customerDetails: {
          name,
          phone,
          email: email || '',
          userId: existingUser ? existingUser._id : null,
        },
        enquiry,
        requestedConsultations: requestedConsultations || '',
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status || 'new ticket',
        createdDate: new Date(),
      });

      return res.status(201).json({ ticket });
    }

    // 3. PUT (Update ticket)
    if (req.method === 'PUT') {
      const { id, name, phone, email, enquiry, requestedConsultations, dueDate, status } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Ticket ID is required' });
      }

      const ticketToUpdate = await EnquiryTicket.findById(id);
      if (!ticketToUpdate) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (name) ticketToUpdate.customerDetails.name = name;
      if (phone) {
        ticketToUpdate.customerDetails.phone = phone;
        // Re-check linked user
        const existingUser = await User.findOne({ phone, role: 'customer' });
        ticketToUpdate.customerDetails.userId = existingUser ? existingUser._id : null;
      }
      if (email !== undefined) ticketToUpdate.customerDetails.email = email;
      if (enquiry) ticketToUpdate.enquiry = enquiry;
      if (requestedConsultations !== undefined) ticketToUpdate.requestedConsultations = requestedConsultations;
      if (dueDate !== undefined) ticketToUpdate.dueDate = dueDate ? new Date(dueDate) : null;
      if (status) ticketToUpdate.status = status;

      await ticketToUpdate.save();
      await ticketToUpdate.populate('customerDetails.userId', 'name phone email batchId');

      return res.status(200).json({ ticket: ticketToUpdate });
    }

    // 4. DELETE (Delete ticket)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Ticket ID is required' });
      }

      const ticketToDelete = await EnquiryTicket.findById(id);
      if (!ticketToDelete) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      await EnquiryTicket.deleteOne({ _id: id });
      return res.status(200).json({ message: 'Ticket deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[tickets]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
