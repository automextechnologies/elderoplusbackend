import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    // Authorize requesting user is an admin
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // GET /api/admin/contacts - List all contacts (customers) or single contact detail
    if (req.method === 'GET') {
      const { id, search, batchId, packageId, salesRepId } = req.query;

      if (id) {
        const contact = await User.findOne({ _id: id, role: 'customer' })
          .populate('batchId')
          .populate('packageId')
          .populate('salesRepId')
          .populate('pipelineId')
          .populate('currentStageId')
          .select('-passwordHash -pushSubscription');
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }
        return res.status(200).json({ contact, customer: contact });
      }

      const query = { role: 'customer' };
      if (batchId) query.batchId = batchId;
      if (packageId) query.packageId = packageId;
      if (salesRepId) query.salesRepId = salesRepId;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      const contacts = await User.find(query)
        .populate('batchId')
        .populate('packageId')
        .populate('salesRepId')
        .populate('pipelineId')
        .populate('currentStageId')
        .select('-passwordHash -pushSubscription')
        .sort({ createdAt: -1 });

      return res.status(200).json({ contacts, customers: contacts });
    }

    // PUT /api/admin/contacts - Update contact details
    if (req.method === 'PUT') {
      const { id, name, phone, age, gender, heightCm, weightKg, batchId, packageId, salesRepId, pipelineId, currentStageId } = req.body;
      if (!id) return res.status(400).json({ error: 'Contact ID is required' });

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (age !== undefined) updateData.age = age;
      if (gender !== undefined) updateData.gender = gender;
      if (heightCm !== undefined) updateData.heightCm = heightCm;
      if (weightKg !== undefined) updateData.weightKg = weightKg;
      if (batchId !== undefined) updateData.batchId = batchId;
      if (packageId !== undefined) updateData.packageId = packageId;
      if (salesRepId !== undefined) updateData.salesRepId = salesRepId;
      if (pipelineId !== undefined) updateData.pipelineId = pipelineId;
      if (currentStageId !== undefined) updateData.currentStageId = currentStageId;

      const updatedContact = await User.findByIdAndUpdate(id, updateData, { new: true })
        .populate('batchId')
        .populate('packageId')
        .populate('salesRepId')
        .populate('pipelineId')
        .populate('currentStageId')
        .select('-passwordHash -pushSubscription');

      return res.status(200).json({ contact: updatedContact, customer: updatedContact });
    }

    // DELETE /api/admin/contacts - Delete contact
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Contact ID is required' });
      await User.findByIdAndDelete(id);
      return res.status(200).json({ message: 'Contact deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error in /api/admin/contacts:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
