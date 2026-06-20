import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Batch from '../_lib/models/Batch.js';
import TaskLog from '../_lib/models/TaskLog.js';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    // 1. Authorize requesting user is an admin
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 2. Handle GET (List customers)
    if (req.method === 'GET') {
      const customers = await User.find({ role: 'customer' })
        .populate('batchId')
        .select('-passwordHash -pushSubscription')
        .sort({ createdAt: -1 });
      return res.status(200).json({ customers });
    }

    // 3. Handle POST (Create customer)
    if (req.method === 'POST') {
      const { name, phone, password, age, gender, heightCm, weightKg, startDate, batchId } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Name, phone, and password are required' });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ error: 'A user with this phone number already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      if (!batchId) {
        return res.status(400).json({ error: 'Assigning the customer to a batch or class is required' });
      }

      const batch = await Batch.findById(batchId);
      if (!batch) {
        return res.status(400).json({ error: 'Selected batch does not exist' });
      }

      if (new Date(batch.startDate) <= new Date()) {
        return res.status(400).json({ error: 'Cannot add or create a customer in a batch after its start date has passed' });
      }

      const finalStartDate = batch.startDate;

      const customer = await User.create({
        name,
        phone,
        passwordHash,
        role: 'customer',
        age: age ? Number(age) : undefined,
        gender,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        startDate: finalStartDate,
        joinedDate: new Date(),
        batchId: batchId,
      });

      await customer.populate('batchId');

      // return created user (without password hash)
      const createdObj = customer.toObject();
      delete createdObj.passwordHash;

      return res.status(201).json({ customer: createdObj });
    }

    // 4. Handle PUT (Edit customer)
    if (req.method === 'PUT') {
      const { id, name, phone, password, age, gender, heightCm, weightKg, startDate, batchId } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Customer ID is required' });
      }

      const customerToUpdate = await User.findById(id);
      if (!customerToUpdate || customerToUpdate.role !== 'customer') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (phone && phone !== customerToUpdate.phone) {
        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
          return res.status(400).json({ error: 'A user with this phone number already exists' });
        }
        customerToUpdate.phone = phone;
      }

      if (name) customerToUpdate.name = name;
      if (password) {
        customerToUpdate.passwordHash = await bcrypt.hash(password, 10);
      }

      customerToUpdate.age = age !== undefined ? (age === '' ? undefined : Number(age)) : customerToUpdate.age;
      customerToUpdate.gender = gender !== undefined ? gender : customerToUpdate.gender;
      customerToUpdate.heightCm = heightCm !== undefined ? (heightCm === '' ? undefined : Number(heightCm)) : customerToUpdate.heightCm;
      customerToUpdate.weightKg = weightKg !== undefined ? (weightKg === '' ? undefined : Number(weightKg)) : customerToUpdate.weightKg;
      if (batchId !== undefined) {
        if (!batchId) {
          return res.status(400).json({ error: 'Assigning the customer to a batch or class is required' });
        }
        if (batchId.toString() !== (customerToUpdate.batchId || '').toString()) {
          const batch = await Batch.findById(batchId);
          if (!batch) {
            return res.status(400).json({ error: 'Selected batch does not exist' });
          }
          if (new Date(batch.startDate) <= new Date()) {
            return res.status(400).json({ error: 'Cannot add a customer to a batch after its start date has passed' });
          }
          customerToUpdate.batchId = batchId;
          customerToUpdate.startDate = batch.startDate;
        }
      } else if (startDate) {
        customerToUpdate.startDate = new Date(startDate);
      }

      await customerToUpdate.save();
      await customerToUpdate.populate('batchId');

      const updatedObj = customerToUpdate.toObject();
      delete updatedObj.passwordHash;

      return res.status(200).json({ customer: updatedObj });
    }

    // 5. Handle DELETE (Delete customer and their logs)
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Customer ID is required' });
      }

      const customerToDelete = await User.findById(id);
      if (!customerToDelete || customerToDelete.role !== 'customer') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Delete user's task logs first
      await TaskLog.deleteMany({ userId: customerToDelete._id });
      // Delete the customer
      await User.deleteOne({ _id: customerToDelete._id });

      return res.status(200).json({ message: 'Customer and all associated logs deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin-customers]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
