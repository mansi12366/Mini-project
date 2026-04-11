import './style.css'

const API_BASE = 'http://localhost:3000';
const SENTINEL_USERS_KEY = 'sentinel_users';

// DOM Elements - Status
const authStatusMsg = document.getElementById('auth-status-msg');

// DOM Elements - Login
const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const loginUser = document.getElementById('login-username');
const loginPass = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

// DOM Elements - Signup
const signupSection = document.getElementById('signup-section');
const signupForm = document.getElementById('signup-form');
const signupUser = document.getElementById('signup-username');
const signupEmail = document.getElementById('signup-email');
const signupPass = document.getElementById('signup-password');
const signupError = document.getElementById('signup-error');
const btnSignup = document.getElementById('btn-signup');

// Toggles
const goToSignup = document.getElementById('go-to-signup');
const goToLogin = document.getElementById('go-to-login');

// Initialize
function init() {
    if (localStorage.getItem('sentinel_session')) {
        window.location.href = '/dashboard.html';
        return;
    }
    setupEventListeners();
}

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
    
    goToSignup.addEventListener('click', () => {
        authStatusMsg.style.display = 'none';
        loginSection.classList.add('hide-section', 'left');
        signupSection.classList.remove('hide-section');
        signupSection.style.transform = 'translateX(0)';
    });
    
    goToLogin.addEventListener('click', () => {
        authStatusMsg.style.display = 'none';
        signupSection.classList.add('hide-section');
        loginSection.classList.remove('hide-section', 'left');
        loginSection.style.transform = 'translateX(0)';
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const username = loginUser.value;
    const password = loginPass.value;

    // Show loading state
    const btnText = btnLogin.querySelector('.btn-text');
    const btnLoader = btnLogin.querySelector('.btn-loader');

    btnStatus(btnLogin, true);
    loginError.style.display = 'none';
    authStatusMsg.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('sentinel_session', Date.now());
            localStorage.setItem('sentinel_user', username);
            window.location.href = '/dashboard.html';
        } else {
            loginError.textContent = data.error || 'Login failed';
            loginError.style.display = 'block';
            loginPass.value = '';
            btnStatus(btnLogin, false);
            
            setTimeout(() => {
                loginError.style.display = 'none';
            }, 3000);
        }
    } catch (err) {
        loginError.textContent = 'Server unavailable';
        loginError.style.display = 'block';
        btnStatus(btnLogin, false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const username = signupUser.value;
    const email = signupEmail.value;
    const password = signupPass.value;

    btnStatus(btnSignup, true);
    signupError.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            btnStatus(btnSignup, false);
            signupForm.reset();

            // Show UI success message instead of alert
            authStatusMsg.textContent = 'Signup successful, please login';
            authStatusMsg.style.display = 'block';
            
            // Toggle back to login form
            signupSection.classList.add('hide-section');
            loginSection.classList.remove('hide-section', 'left');
            loginSection.style.transform = 'translateX(0)';
        } else {
            signupError.textContent = data.error || 'Signup failed';
            signupError.style.display = 'block';
            btnStatus(btnSignup, false);
        }
    } catch (err) {
        signupError.textContent = 'Server unavailable';
        signupError.style.display = 'block';
        btnStatus(btnSignup, false);
    }
}

function btnStatus(btn, loading) {
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    
    if (loading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
        btn.disabled = true;
    } else {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

init();
