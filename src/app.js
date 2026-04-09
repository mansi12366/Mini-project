const express = require('express');
const mongoose = require('mongoose');
const redis = require('./config/redis');
const ThrottleMiddleware = require('./middleware/throttle');
const CapacityService = require('./services/CapacityCalculator');
const cors = require('cors');

const app = express();
const path = require('path');

app.use(cors());
app.use(express.static(path.join(__dirname, '../client'))); // Serve static files from client

// Serve the login page by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});
const throttle = new ThrottleMiddleware(redis, mongoose.connection);

// Global JSON parsing
app.use(express.json());

// --- DASHBOARD METRICS LOGIC ---
const MAX_CAPACITY = 100;
const REFILL_AMOUNT = 10;

let metricsState = {
    tokens: 100,
    resetTimer: 60
};

// --- PER-USER TOKEN STATS ---
let userTokenStats = {}; // { username: tokens_used }

// Reset tokens for EACH user every 60 seconds
setInterval(() => {
    Object.keys(userTokenStats).forEach(user => {
        userTokenStats[user] = 0;
    });
    console.log(`[RESET] Per-user token stats cleared`);
}, 60000);

// Strict 1s interval for deterministic metrics
setInterval(() => {
    metricsState.resetTimer -= 1;
    
    if (metricsState.resetTimer <= 0) {
        // Refill tokens exactly at 0
        metricsState.tokens = Math.min(MAX_CAPACITY, metricsState.tokens + REFILL_AMOUNT);
        metricsState.resetTimer = 60;
        console.log(`[REFILL] Tokens: ${metricsState.tokens} | Reset Timer: ${metricsState.resetTimer}`);
    }
}, 1000);

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
    next();
});

// Tier-based throttle configurations
const throttleConfigs = {
    // Free tier: strict limits
    free: {
        user: { capacity: 60, refillRate: 10 },      // 10 req/sec, burst 60
        client: { capacity: 60, refillRate: 2 },    // 2 req/sec (to support 1s dashboard polling)
        endpoint: { capacity: 100, refillRate: 2 }
    },
    // Pro tier: moderate
    pro: {
        user: { capacity: 600, refillRate: 10 },    // 10 req/sec
        client: { capacity: 300, refillRate: 5 },
        endpoint: { capacity: 1000, refillRate: 20 }
    },
    // Enterprise: high limits with dynamic adjustment
    enterprise: {
        user: { capacity: 10000, refillRate: 100 },  // 100 req/sec base
        client: { capacity: 5000, refillRate: 50 },
        endpoint: { capacity: 20000, refillRate: 200 }
    }
};

// --- DASHBOARD METRICS ENDPOINT (Unthrottled, outside /api/ to avoid token deduction) ---
app.get('/metrics', (req, res) => {
    const tokensUsed = MAX_CAPACITY - metricsState.tokens;
    const systemLoad = (tokensUsed / MAX_CAPACITY) * 100;

    res.json({
        availableCapacity: MAX_CAPACITY,
        bucketStatus: metricsState.tokens,
        nextReset: metricsState.resetTimer,
        systemLoad: Number(systemLoad.toFixed(2))
    });
});

// --- PER-USER TOKEN STATS ENDPOINT ---
app.get('/token-stats', (req, res) => {
    const stats = Object.entries(userTokenStats).map(([username, used]) => ({
        username,
        tokens_used: used,
        tokens_remaining: Math.max(0, 100 - used)
    }));
    res.json(stats);
});

// --- DASHBOARD TOKEN TRACKING ---
app.use('/api/',
    // 0. Per-user visual token tracking
    (req, res, next) => {
        const username = req.headers['x-api-key'] || 'anonymous';
        if (userTokenStats[username] === undefined) userTokenStats[username] = 0;

        // Enforce the 100 token limit
        if (userTokenStats[username] >= 100) {
            return res.status(429).json({
                status: "Rate Limited",
                error: "User quota exceeded (100 tokens/60s)",
                tokens_remaining: 0
            });
        }

        // Increment on success
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                userTokenStats[username] = (userTokenStats[username] || 0) + 1;
            }
        });
        next();
    },

    (req, res, next) => {
        let tokens = metricsState.tokens ?? 100;
        const type = req.body?.type || req.query?.type || 'low';
        let cost;

        if (type === "low") cost = 1;
        else if (type === "medium") cost = 2;
        else if (type === "critical") cost = 3;
        else {
            console.log("Invalid request type:", type);
            return res.status(400).json({ error: 'Invalid request type' });
        }

        console.log("Request type:", type);
        console.log("Tokens before:", tokens);
        console.log("Cost:", cost);

        if (tokens >= cost) {
            tokens = tokens - cost;
            metricsState.tokens = tokens;
            console.log("Tokens after:", tokens);
            next();
        } else {
            console.log("Request Denied: Not enough tokens");
            res.status(429).json({ 
                status: "Rate Limited", 
                tokens_remaining: tokens 
            });
        }
    },

    // 1. Per-client IP throttling (DDoS protection)
    throttle.createMiddleware({
        type: 'client',
        ...throttleConfigs.free.client
    }),

    // 2. Per-user/API key throttling (account limits)
    (req, res, next) => {
        const tier = req.user?.tier || 'free';
        return throttle.createMiddleware({
            type: 'user',
            ...throttleConfigs[tier].user,
            costCalculator: async (req) => {
                // Expensive endpoints cost more tokens
                const complexity = req.body?.complexity || 1;
                return Math.ceil(complexity * 1);
            }
        })(req, res, next);
    },

    // 3. Per-endpoint throttling (resource protection)
    throttle.createMiddleware({
        type: 'endpoint',
        ...throttleConfigs.free.endpoint
    })
);

// Example endpoints
app.post('/api/orders', async (req, res) => {
    if (req.abortSignal?.aborted) {
        return res.status(503).json({ error: 'Request interrupted by throttle policy' });
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    res.json({ 
        status: "success",
        tokens_remaining: metricsState.tokens,
        tokens_used: 100 - metricsState.tokens
    });
});

app.post('/api/heavy-task', async (req, res) => {
    if (req.abortSignal?.aborted) {
        return res.status(503).json({ error: 'Request interrupted by throttle policy' });
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
    res.json({ 
        status: "success",
        tokens_remaining: metricsState.tokens,
        tokens_used: 100 - metricsState.tokens
    });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        status: "success",
        tokens_remaining: metricsState.tokens,
        tokens_used: 100 - metricsState.tokens
    });
});

// --- LOGIN HISTORY & AUTH LOGIC ---
const users = [];
const loginHistory = [];

app.post('/auth/signup', (req, res) => {
    const { username, password, email } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const newUser = {
        username,
        password,
        email,
        total_attempts: 0,
        successful_logins: 0,
        failed_logins: 0,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    res.json({ status: 'success', message: 'User registered' });
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    // Find user
    const user = users.find(u => u.username === username);
    
    // Hardcoded admin fallback
    const isAdmin = (username === 'admin' && password === 'admin123');
    let entry = {
        username,
        email: user ? user.email : 'N/A',
        timestamp,
        ip,
        status: 'FAILED',
        failureReason: '',
        attemptCount: 0
    };

    if (user || isAdmin) {
        if (user) user.total_attempts += 1;
        
        const isMatch = isAdmin || (user && user.password === password);
        
        if (isMatch) {
            if (user) user.successful_logins += 1;
            entry.status = 'SUCCESS';
            entry.attemptCount = user ? user.total_attempts : 1;
            
            loginHistory.unshift(entry); // Latest first
            return res.json({ status: 'SUCCESS', username });
        } else {
            if (user) user.failed_logins += 1;
            entry.status = 'FAILED';
            entry.failureReason = 'Invalid password';
            entry.attemptCount = user ? user.total_attempts : 1;
            
            loginHistory.unshift(entry);
            return res.status(401).json({ status: 'FAILED', error: 'Invalid password' });
        }
    } else {
        entry.status = 'FAILED';
        entry.failureReason = 'User not found';
        entry.attemptCount = 0;
        
        loginHistory.unshift(entry);
        return res.status(404).json({ status: 'FAILED', error: 'User not found' });
    }
});

app.get('/auth/history', (req, res) => {
    const { status, username } = req.query;
    let filtered = [...loginHistory];

    if (status && status !== 'ALL') {
        filtered = filtered.filter(h => h.status === status);
    }

    if (username) {
        filtered = filtered.filter(h => h.username.toLowerCase().includes(username.toLowerCase()));
    }

    res.json(filtered);
});

// Health check with capacity status
app.get('/health', async (req, res) => {
    const capacity = await new CapacityService(mongoose.connection).getCurrentCapacity().catch(() => ({}));
    res.json({
        status: 'healthy',
        capacity: capacity,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
