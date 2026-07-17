// Validation Utilities

const Validator = {
    // Validate username/account number
    validateUsername(username) {
        if (!username) {
            return { valid: false, message: 'Username is required' };
        }
        if (username.length < 3) {
            return { valid: false, message: 'Username must be at least 3 characters' };
        }
        if (username.length > 50) {
            return { valid: false, message: 'Username must be less than 50 characters' };
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
            return { valid: false, message: 'Username contains invalid characters' };
        }
        return { valid: true };
    },

    // Validate password
    validatePassword(password) {
        if (!password) {
            return { valid: false, message: 'Password is required' };
        }
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters' };
        }
        if (password.length > 100) {
            return { valid: false, message: 'Password must be less than 100 characters' };
        }
        // Check for at least one number
        if (!/\d/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        // Check for at least one uppercase letter
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        // Check for at least one lowercase letter
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        return { valid: true };
    },

    // Validate OTP
    validateOTP(otp) {
        if (!otp) {
            return { valid: false, message: 'OTP is required' };
        }
        if (!/^\d{6}$/.test(otp)) {
            return { valid: false, message: 'OTP must be exactly 6 digits' };
        }
        return { valid: true };
    },

    // Validate email
    validateEmail(email) {
        if (!email) {
            return { valid: false, message: 'Email is required' };
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, message: 'Please enter a valid email address' };
        }
        return { valid: true };
    },

    // Validate phone number
    validatePhone(phone) {
        if (!phone) {
            return { valid: false, message: 'Phone number is required' };
        }
        const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
        if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
            return { valid: false, message: 'Please enter a valid phone number' };
        }
        return { valid: true };
    }
};

// Form validation functions
function validateForm(form) {
    const inputs = form.querySelectorAll('input[required]');
    let isValid = true;
    let errors = [];

    inputs.forEach(input => {
        const value = input.value.trim();
        let result;

        switch (input.id) {
            case 'username':
                result = Validator.validateUsername(value);
                break;
            case 'password':
                result = Validator.validatePassword(value);
                break;
            case 'otp':
                result = Validator.validateOTP(value);
                break;
            case 'email':
                result = Validator.validateEmail(value);
                break;
            case 'phone':
                result = Validator.validatePhone(value);
                break;
            default:
                if (!value) {
                    result = { valid: false, message: 'This field is required' };
                } else {
                    result = { valid: true };
                }
        }

        if (!result.valid) {
            isValid = false;
            errors.push({
                field: input.id,
                message: result.message
            });
            showFieldError(input, result.message);
        } else {
            clearFieldError(input);
        }
    });

    return { valid: isValid, errors };
}

function showFieldError(input, message) {
    const existingError = input.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.textContent = message;
    } else {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.style.cssText = 'color: #c8102e; font-size: 12px; margin-top: 5px;';
        errorDiv.textContent = message;
        input.parentElement.appendChild(errorDiv);
    }
    input.style.borderColor = '#c8102e';
}

function clearFieldError(input) {
    const existingError = input.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    input.style.borderColor = '';
}

// Real-time validation
function setupRealtimeValidation() {
    document.querySelectorAll('input[required]').forEach(input => {
        input.addEventListener('blur', function() {
            const value = this.value.trim();
            let result;

            switch (this.id) {
                case 'username':
                    result = Validator.validateUsername(value);
                    break;
                case 'password':
                    result = Validator.validatePassword(value);
                    break;
                case 'otp':
                    result = Validator.validateOTP(value);
                    break;
                case 'email':
                    result = Validator.validateEmail(value);
                    break;
                case 'phone':
                    result = Validator.validatePhone(value);
                    break;
                default:
                    result = value ? { valid: true } : { valid: false, message: 'This field is required' };
            }

            if (!result.valid) {
                showFieldError(this, result.message);
            } else {
                clearFieldError(this);
            }
        });

        input.addEventListener('input', function() {
            if (this.value.trim()) {
                clearFieldError(this);
            }
        });
    });
}

// Initialize validation on page load
document.addEventListener('DOMContentLoaded', function() {
    setupRealtimeValidation();
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Validator, validateForm };
    }
