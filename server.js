import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './api/_lib/mongodb.js';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Global API request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMsg = `[API Hit] ${req.method} ${req.originalUrl || req.url} - Status: ${res.statusCode} - Duration: ${duration}ms`;
    if (res.statusCode >= 400) {
      console.error(`${logMsg} - ERROR/WARNING`);
    } else {
      console.log(logMsg);
    }
  });
  next();
});

// Helper to wrap Vercel handlers for Express
const vercelToExpress = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('Error in handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};

// Route imports
import loginHandler from './api/auth/login.js';
import daysIndexHandler from './api/days/index.js';
import daysIdHandler from './api/days/[dayNumber].js';
import tasksLogHandler from './api/tasks/log.js';
import tasksIdHandler from './api/tasks/[id].js';
import userProfileHandler from './api/user/profile.js';
import adminCustomersHandler from './api/admin/customers.js';
import adminContactsHandler from './api/admin/contacts.js';
import adminOnboardingHandler from './api/admin/onboarding.js';
import adminBatchesHandler from './api/admin/batches.js';
import adminCustomerTasksHandler from './api/admin/customer-tasks.js';
import adminTestNotificationHandler from './api/admin/test-notification.js';
import adminPipelineStagesHandler from './api/admin/pipeline-stages.js';
import adminPipelinesHandler from './api/admin/pipelines.js';
import adminTicketsHandler from './api/admin/tickets.js';
import adminPackagesHandler from './api/admin/packages.js';
import adminSalesRepsHandler from './api/admin/sales-reps.js';
import adminPushConfigHandler from './api/admin/push-config.js';
import adminSendInstantPushHandler from './api/admin/send-instant-push.js';
import fcmSubscribeHandler from './api/notifications/fcm-subscribe.js';
import fcmUnsubscribeHandler from './api/notifications/fcm-unsubscribe.js';
import notificationsSubscribeHandler from './api/notifications/subscribe.js';
import notificationsUnsubscribeHandler from './api/notifications/unsubscribe.js';
import notificationsScheduleTodayHandler from './api/notifications/schedule-today.js';
import { firebaseAdmin } from './api/_lib/firebase.js';

import bcrypt from 'bcryptjs';
import User from './api/_lib/models/User.js';
import PipelineStage from './api/_lib/models/PipelineStage.js';
import Package from './api/_lib/models/Package.js';

async function seedDefaultUser() {
  try {
    const defaultCustomer = await User.findOne({ phone: '1234567890' });
    if (!defaultCustomer) {
      console.log('No default customer found (phone 1234567890). Seeding default customer...');
      const passwordHash = await bcrypt.hash('password123', 10);
      await User.create({
        name: 'Eldro User',
        phone: '1234567890',
        passwordHash,
        age: 65,
        gender: 'male',
        heightCm: 170,
        weightKg: 70,
        startDate: new Date(),
        role: 'customer',
      });
      console.log('Default user seeded successfully (Phone: 1234567890, Password: password123)');
    }

    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('No admin user found. Seeding default admin user...');
      const adminPasswordHash = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'Eldro Admin',
        phone: '9999999999',
        passwordHash: adminPasswordHash,
        role: 'admin',
      });
      console.log('Default admin user seeded successfully (Phone: 9999999999, Password: admin123)');
    }

    const stageCount = await PipelineStage.countDocuments();
    if (stageCount === 0) {
      console.log('No pipeline stages found. Seeding default stages...');
      const defaultStages = [
        { name: 'Documentation', order: 0 },
        { name: 'Health Assessment', order: 1 },
        { name: 'Care Plan Creation', order: 2 },
        { name: 'Active Challenge', order: 3 },
        { name: 'Review & Feedback', order: 4 },
      ];
      await PipelineStage.insertMany(defaultStages);
      console.log('Default pipeline stages seeded successfully.');
    }

    // Seed default Tester Pack package
    const testerPack = await Package.findOne({ name: 'Tester Pack' });
    if (!testerPack) {
      console.log('Seeding Tester Pack package...');
      await Package.create({
        name: 'Tester Pack',
        description: 'Standard tester pack for testing pre-recorded classes and tasks.',
        items: [
          'Pre-recorded Yoga & Mobility Class',
          'Pre-recorded Meditation & Mindfulness Class',
          'Hydration Tracking (Target 2.5L)',
          'Protein Intake Logger (Target 60g)',
          'Sleep and Recovery Log'
        ]
      });
      console.log('Tester Pack package seeded successfully.');
    }
  } catch (err) {
    console.error('Error seeding default user/admin:', err);
  }
}

// Auth Routes
app.all('/api/auth/login', vercelToExpress(loginHandler));

// Admin Routes
app.all('/api/admin/customers', vercelToExpress(adminCustomersHandler));
app.all('/api/admin/contacts', vercelToExpress(adminContactsHandler));
app.all('/api/admin/onboarding', vercelToExpress(adminOnboardingHandler));
app.all('/api/admin/batches', vercelToExpress(adminBatchesHandler));
app.all('/api/admin/customer-tasks', vercelToExpress(adminCustomerTasksHandler));
app.all('/api/admin/test-notification', vercelToExpress(adminTestNotificationHandler));
app.all('/api/admin/pipeline-stages', vercelToExpress(adminPipelineStagesHandler));
app.all('/api/admin/pipelines', vercelToExpress(adminPipelinesHandler));
app.all('/api/admin/tickets', vercelToExpress(adminTicketsHandler));
app.all('/api/admin/packages', vercelToExpress(adminPackagesHandler));
app.all('/api/admin/sales-reps', vercelToExpress(adminSalesRepsHandler));
app.all('/api/admin/push-config', vercelToExpress(adminPushConfigHandler));
app.all('/api/admin/send-instant-push', vercelToExpress(adminSendInstantPushHandler));

// User Routes
app.all('/api/user/profile', vercelToExpress(userProfileHandler));

// Days Routes
app.all('/api/days', vercelToExpress(daysIndexHandler));
app.all('/api/days/:dayNumber', (req, res) => {
  // Vercel extracts path params into req.query, simulate this for Express
  req.query = { ...req.query, dayNumber: req.params.dayNumber };
  return vercelToExpress(daysIdHandler)(req, res);
});

// Tasks Routes
app.all('/api/tasks/log', vercelToExpress(tasksLogHandler));
app.all('/api/tasks/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return vercelToExpress(tasksIdHandler)(req, res);
});

// Notifications Routes
app.all('/api/notifications/fcm-subscribe', vercelToExpress(fcmSubscribeHandler));
app.all('/api/notifications/fcm-unsubscribe', vercelToExpress(fcmUnsubscribeHandler));
app.all('/api/notifications/subscribe', vercelToExpress(notificationsSubscribeHandler));
app.all('/api/notifications/unsubscribe', vercelToExpress(notificationsUnsubscribeHandler));
app.all('/api/notifications/schedule-today', vercelToExpress(notificationsScheduleTodayHandler));


// Default route for undefined endpoints
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

async function startWaterReminderScheduler() {
  // Check every 2 minutes for users who need a water reminder
  setInterval(async () => {
    try {
      await connectDB();
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Find all users who have an FCM token AND either lastWaterNotificationSent is null or it was sent >= 2 hours ago
      // If they are package/no-batch users, they must have challengeStarted set to true
      const users = await User.find({
        role: 'customer',
        fcmToken: { $ne: null },
        $and: [
          {
            $or: [
              { batchId: { $ne: null } },
              { challengeStarted: true }
            ]
          },
          {
            $or: [
              { lastWaterNotificationSent: null },
              { lastWaterNotificationSent: { $lte: twoHoursAgo } }
            ]
          }
        ]
      });

      if (users.length === 0) return;

      console.log(`[Scheduler] Found ${users.length} customer(s) to send water intake reminders to.`);

      for (const user of users) {
        if (!firebaseAdmin) {
          console.warn(`[Scheduler] Skipping user ${user.name} (${user._id}) because Firebase Admin is not initialized.`);
          user.lastWaterNotificationSent = now;
          await user.save();
          continue;
        }

        try {
          const message = {
            notification: {
              title: 'Water Intake Reminder',
              body: 'Time to drink water! Keep your hydration target on track.',
            },
            data: {
              url: '/'
            },
            token: user.fcmToken,
          };

          await firebaseAdmin.messaging().send(message);
          console.log(`[Scheduler] Successfully sent FCM reminder to ${user.name}`);
        } catch (fcmErr) {
          console.error(`[Scheduler] Failed to send FCM reminder to user ${user.name}:`, fcmErr.message);
          if (fcmErr.code === 'messaging/registration-token-not-registered' || fcmErr.code === 'messaging/invalid-argument') {
            console.log(`[Scheduler] Clearing invalid token for user ${user.name}`);
            user.fcmToken = null;
          }
        }

        user.lastWaterNotificationSent = now;
        await user.save();
      }
    } catch (err) {
      console.error('[Scheduler] Error running water reminder check:', err);
    }
  }, 120000); // 2 minutes
}

import fs from 'fs';

const logFile = './debug.log';

connectDB().then(async () => {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] MongoDB connected successfully.\n`);
  await seedDefaultUser();
  app.listen(PORT, '0.0.0.0', () => {
    const msg = `Backend server running on http://localhost:${PORT}`;
    console.log(msg);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    startWaterReminderScheduler();
  });
}).catch(err => {
  const errMsg = `Failed to connect to MongoDB: ${err.message}\nStack: ${err.stack}`;
  console.error(errMsg);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${errMsg}\n`);
});
