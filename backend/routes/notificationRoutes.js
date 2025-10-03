const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const NotificationService = require('../services/notificationService');
const User = require('../models/userModel');
const admin = require('../config/firebase.js');

const router = express.Router();

router.post('/token', protect, async (req, res) => {
  const { fcmToken } = req.body;
  
  try {
    // Update user's FCM token in MongoDB
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    
    // Cache token in Redis
    await NotificationService.cacheUserToken(req.user._id, fcmToken);
    
    res.status(200).json({ message: 'Token updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update token' });
  }
});

router.post('/test-kafka', protect, async (req, res) => {
  try {
    const testNotification = {
      userId: req.user._id,
      title: "Test Notification",
      body: "This is a test notification via Kafka",
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    };

    await NotificationService.queueNotification(testNotification);
    res.status(200).json({ message: 'Test notification queued successfully' });
  } catch (error) {
    console.error('Kafka test error:', error);
    res.status(500).json({ error: 'Failed to queue test notification' });
  }
});

router.get('/test-kafka-connection', protect, async (req, res) => {
  try {
    const isConnected = await NotificationService.testKafkaConnection();
    if (isConnected) {
      res.status(200).json({ message: 'Kafka connection test successful' });
    } else {
      res.status(500).json({ message: 'Kafka connection test failed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-fcm', protect, async (req, res) => {
  try {
    // Debug log to check user
    console.log('👤 User from request:', req.user);
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({ 
        error: 'User not authenticated properly',
        user: req.user 
      });
    }

    // Get user's FCM token
    const fcmToken = await NotificationService.getFCMToken(req.user._id);
    console.log('🔑 FCM Token:', fcmToken);

    if (!fcmToken) {
      return res.status(400).json({ error: 'No FCM token found for user' });
    }

    const message = {
      token: fcmToken,
      notification: {
        title: 'Direct FCM Test',
        body: `Test message at ${new Date().toLocaleTimeString()}`,
      },
      webpush: {
        notification: {
          title: 'Direct FCM Test',
          body: `Test message at ${new Date().toLocaleTimeString()}`,
          icon: '/icon.png',
          badge: '/badge.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          tag: Date.now().toString()
        },
        fcm_options: {
          link: '/'
        }
      }
    };

    console.log('📤 Sending test FCM message:', message);
    
    const response = await admin.messaging().send(message);
    console.log('✅ FCM Response:', response);

    res.json({ success: true, messageId: response });
  } catch (error) {
    console.error('❌ FCM Test Error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : null
    });
  }
});

router.get('/test-redis', async (req, res) => {
  try {
    const isConnected = await NotificationService.testRedisConnection();
    if (isConnected) {
      res.json({ status: 'success', message: 'Redis connection successful' });
    } else {
      res.status(500).json({ status: 'error', message: 'Redis connection failed' });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      details: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      }
    });
  }
});

router.get('/test-connections', async (req, res) => {
  try {
    const results = await NotificationService.testConnections();
    res.json({
      status: 'success',
      connections: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test sending a notification
router.post('/test-notification', async (req, res) => {
  try {
    const testNotification = {
      id: Date.now().toString(),
      type: 'test',
      message: 'Test notification',
      timestamp: new Date().toISOString()
    };

    const sent = await NotificationService.sendNotification(testNotification);
    
    res.json({
      status: sent ? 'success' : 'error',
      notification: testNotification
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router; 