import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Batch from '../_lib/models/Batch.js';
import PipelineStage from '../_lib/models/PipelineStage.js';
import Pipeline from '../_lib/models/Pipeline.js';
import TaskLog from '../_lib/models/TaskLog.js';
import Package from '../_lib/models/Package.js';
import SalesRep from '../_lib/models/SalesRep.js';
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

    // 2. Handle GET (List customers or get single customer)
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const customer = await User.findOne({ _id: id, role: 'customer' })
          .populate('batchId')
          .populate('packageId')
          .populate('salesRepId')
          .select('-passwordHash -pushSubscription');
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
        return res.status(200).json({ customer });
      }

      const customers = await User.find({ role: 'customer' })
        .populate('batchId')
        .populate('packageId')
        .populate('salesRepId')
        .select('-passwordHash -pushSubscription')
        .sort({ createdAt: -1 });
      return res.status(200).json({ customers });
    }

    // 3. Handle POST (Create customer)
    if (req.method === 'POST') {
      const { name, phone, password, age, gender, heightCm, weightKg, startDate, batchId, packageId, salesRepId } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Name, phone, and password are required' });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ error: 'A user with this phone number already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Package & Batch override logic
      let finalBatchId = batchId || null;
      let finalStartDate = null;
      let challengeStarted = false;

      if (!packageId) {
        return res.status(400).json({ error: 'Assigning the customer to a package is required' });
      }

      const pkg = await Package.findById(packageId);
      if (!pkg) {
        return res.status(400).json({ error: 'Selected package does not exist' });
      }

      if (pkg.name === 'Tester Pack') {
        // Tester Pack automatically overrides to NONE batch
        finalBatchId = null;
        finalStartDate = null;
        challengeStarted = false;
      } else {
        // Regular package requires a batch
        if (!batchId || batchId === 'NONE') {
          return res.status(400).json({ error: 'Regular packages must be assigned to a batch' });
        }
        const batch = await Batch.findById(batchId);
        if (!batch) {
          return res.status(400).json({ error: 'Selected batch does not exist' });
        }
        finalBatchId = batchId;
        finalStartDate = batch.startDate;
        challengeStarted = true;
      }

      // Get initial pipeline stages from default or selected pipeline
      let pipelineStages = [];
      let currentStageId = null;
      let pipelineId = req.body.pipelineId || null;

      if (!pipelineId) {
        const firstPipeline = await Pipeline.findOne().sort({ order: 1 });
        if (firstPipeline) pipelineId = firstPipeline._id;
      }

      if (pipelineId) {
        const dbStages = await PipelineStage.find({ pipelineId }).sort({ order: 1 });
        pipelineStages = dbStages.map((s) => ({
          stageId: s._id,
          name: s.name,
          completed: false,
          completedAt: null
        }));
        currentStageId = dbStages.length > 0 ? dbStages[0]._id : null;
      }

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
        batchId: finalBatchId,
        packageId: packageId,
        salesRepId: salesRepId || null,
        challengeStarted,
        pipelineId,
        pipelineStages,
        currentStageId,
      });

      await customer.populate(['batchId', 'packageId', 'salesRepId']);

      // return created user (without password hash)
      const createdObj = customer.toObject();
      delete createdObj.passwordHash;

      return res.status(201).json({ customer: createdObj });
    }

    // 4. Handle PUT (Edit customer)
    if (req.method === 'PUT') {
      const { id, name, phone, password, age, gender, heightCm, weightKg, startDate, batchId, packageId, pipelineId, currentStageId, salesRepId } = req.body;

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
      
      const finalPackageId = packageId !== undefined ? packageId : customerToUpdate.packageId;
      if (finalPackageId) {
        const pkg = await Package.findById(finalPackageId);
        if (!pkg) {
          return res.status(400).json({ error: 'Selected package does not exist' });
        }
        customerToUpdate.packageId = finalPackageId;

        if (pkg.name === 'Tester Pack') {
          customerToUpdate.batchId = null;
          if (!customerToUpdate.challengeStarted) {
            customerToUpdate.startDate = null;
          }
        } else {
          const finalBatchId = batchId !== undefined ? batchId : customerToUpdate.batchId;
          if (!finalBatchId || finalBatchId === 'NONE') {
            return res.status(400).json({ error: 'Regular packages must be assigned to a batch' });
          }

          if (finalBatchId.toString() !== (customerToUpdate.batchId || '').toString()) {
            const batch = await Batch.findById(finalBatchId);
            if (!batch) {
              return res.status(400).json({ error: 'Selected batch does not exist' });
            }
            customerToUpdate.batchId = finalBatchId;
            customerToUpdate.startDate = batch.startDate;
            customerToUpdate.challengeStarted = true;
          }
        }
      }

      if (salesRepId !== undefined) {
        customerToUpdate.salesRepId = salesRepId || null;
      }

      // Handle pipelineId and currentStageId updates and checklist modifications
      if (pipelineId !== undefined || currentStageId !== undefined) {
        let targetPipelineId = pipelineId !== undefined ? pipelineId : customerToUpdate.pipelineId;
        let targetStageId = currentStageId !== undefined ? currentStageId : customerToUpdate.currentStageId;

        // If targetStageId is provided, we can resolve targetPipelineId from it
        if (targetStageId && targetStageId !== '') {
          const stage = await PipelineStage.findById(targetStageId);
          if (stage) {
            targetPipelineId = stage.pipelineId;
          }
        }

        if (!targetPipelineId) {
          // Clear everything
          customerToUpdate.pipelineId = null;
          customerToUpdate.currentStageId = null;
          customerToUpdate.pipelineStages = [];
        } else {
          customerToUpdate.pipelineId = targetPipelineId;
          const dbStages = await PipelineStage.find({ pipelineId: targetPipelineId }).sort({ order: 1 });

          // Merge db stages
          const mergedStages = dbStages.map((dbStage) => {
            const existing = (customerToUpdate.pipelineStages || []).find(
              (ps) => ps.stageId?.toString() === dbStage._id.toString()
            );
            return {
              stageId: dbStage._id,
              name: dbStage.name,
              completed: existing ? existing.completed : false,
              completedAt: existing ? existing.completedAt : null,
            };
          });

          if (!targetStageId || targetStageId === '') {
            // Reset all checkmarks
            mergedStages.forEach((ps) => {
              ps.completed = false;
              ps.completedAt = null;
            });
            customerToUpdate.pipelineStages = mergedStages;
            customerToUpdate.currentStageId = null;
          } else {
            const targetIndex = mergedStages.findIndex(
              (ps) => ps.stageId.toString() === targetStageId.toString()
            );

            if (targetIndex !== -1) {
              for (let i = 0; i < mergedStages.length; i++) {
                if (i < targetIndex) {
                  if (!mergedStages[i].completed) {
                    mergedStages[i].completed = true;
                    mergedStages[i].completedAt = new Date();
                  }
                } else {
                  mergedStages[i].completed = false;
                  mergedStages[i].completedAt = null;
                }
              }
              customerToUpdate.pipelineStages = mergedStages;
              customerToUpdate.currentStageId = targetStageId;
            } else {
              // Target stage doesn't exist in this pipeline (unlikely but safe fallback)
              customerToUpdate.pipelineStages = mergedStages;
              customerToUpdate.currentStageId = null;
            }
          }
        }
      }

      await customerToUpdate.save();
      await customerToUpdate.populate(['batchId', 'packageId', 'salesRepId']);

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
