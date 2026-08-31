import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Batch from '../_lib/models/Batch.js';
import PipelineStage from '../_lib/models/PipelineStage.js';
import Pipeline from '../_lib/models/Pipeline.js';
import Package from '../_lib/models/Package.js';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    // 1. Authorize admin
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 2. GET /api/admin/onboarding - Onboarding Overview & Pipeline Stats
    if (req.method === 'GET') {
      const recentOnboarded = await User.find({ role: 'customer' })
        .populate('batchId')
        .populate('packageId')
        .populate('salesRepId')
        .select('-passwordHash -pushSubscription')
        .sort({ createdAt: -1 })
        .limit(20);

      const totalCustomers = await User.countDocuments({ role: 'customer' });
      const totalBatches = await Batch.countDocuments();
      const pipelines = await Pipeline.find().sort({ order: 1 });

      return res.status(200).json({
        recentOnboarded,
        stats: {
          totalCustomers,
          totalBatches,
          totalPipelines: pipelines.length
        }
      });
    }

    // 3. POST /api/admin/onboarding - Register / Onboard New Customer
    if (req.method === 'POST') {
      const { name, phone, password, age, gender, heightCm, weightKg, startDate, batchId, packageId, salesRepId, pipelineId } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Name, phone, and password are required' });
      }

      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ error: 'A customer with this phone number already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      let finalBatchId = batchId || null;
      let finalStartDate = null;
      let challengeStarted = false;

      if (!packageId) {
        return res.status(400).json({ error: 'Assigning a package is required' });
      }

      const pkg = await Package.findById(packageId);
      if (!pkg) {
        return res.status(400).json({ error: 'Selected package does not exist' });
      }

      if (pkg.name === 'Tester Pack') {
        finalBatchId = null;
        finalStartDate = null;
        challengeStarted = false;
      } else {
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

      // Initial pipeline stages setup
      let pipelineStages = [];
      let currentStageId = null;
      let targetPipelineId = pipelineId || null;

      if (!targetPipelineId) {
        const firstPipeline = await Pipeline.findOne().sort({ order: 1 });
        if (firstPipeline) targetPipelineId = firstPipeline._id;
      }

      if (targetPipelineId) {
        const dbStages = await PipelineStage.find({ pipelineId: targetPipelineId }).sort({ order: 1 });
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
        gender: gender || 'male',
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        startDate: finalStartDate,
        joinedDate: new Date(),
        batchId: finalBatchId,
        packageId: packageId,
        salesRepId: salesRepId || null,
        challengeStarted,
        pipelineId: targetPipelineId,
        pipelineStages,
        currentStageId,
      });

      await customer.populate(['batchId', 'packageId', 'salesRepId']);

      const createdObj = customer.toObject();
      delete createdObj.passwordHash;

      return res.status(201).json({ customer: createdObj, message: 'Customer onboarded successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin-onboarding]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
