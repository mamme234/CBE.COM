// Toggle password visibility
function togglePassword() {
    const passwordInput = document.querySelector('input[name="password"]');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
    } else {
        passwordInput.type = 'password';
    }
}

// Add loading effect on form submit
document.getElementById('loginForm').addEventListener('submit', function(e) {
    const btn = document.querySelector('button');
    btn.innerHTML = '⏳ Verifying...';
    btn.disabled = true;
});

// Prevent right-click (to hide source code)
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Disable dev tools shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
        return false;
    }
});
