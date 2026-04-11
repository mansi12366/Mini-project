import './style.css'

const API_BASE = 'http://localhost:3000';

const elements = {
    metricCapacity: document.getElementById('metric-capacity'),
    metricLoad: document.getElementById('metric-load'),
    metricReset: document.getElementById('metric-reset'),
    metricTokens: document.getElementById('metric-tokens'),
    loadProgress: document.getElementById('load-progress-bar'),
    systemStatus: document.getElementById('system-status-text'),
    logDisplay: document.getElementById('log-display'),
    apiKey: document.getElementById('api-key'),
    apiEndpoint: document.getElementById('api-endpoint'),
    apiComplexity: document.getElementById('api-complexity'),
    complexityLabel: document.getElementById('complexity-label'),
    btnFire: document.getElementById('btn-fire'),
    btnBurst: document.getElementById('btn-burst'),
    btnClear: document.getElementById('btn-clear'),
    btnLogout: document.getElementById('btn-logout')
};

// State
let pollInterval = null;

// Initialize
function init() {
    if (!localStorage.getItem('sentinel_session')) {
        window.location.href = '/index.html';
        return;
    }

    setupEventListeners();

    // Start ONE polling interval — never create multiple
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollSystemHealth, 1000);
    
    pollSystemHealth();
}

function setupEventListeners() {
    elements.btnLogout.addEventListener('click', () => {
        localStorage.removeItem('sentinel_session');
        window.location.href = '/index.html';
    });

    elements.btnFire.addEventListener('click', () => fireRequest());
    elements.btnBurst.addEventListener('click', () => fireBurst());
    elements.btnClear.addEventListener('click', () => {
        elements.logDisplay.innerHTML = '';
    });

    elements.apiComplexity.addEventListener('input', (e) => {
        elements.complexityLabel.textContent = `COST: ${e.target.value} TOKENS`;
    });
}

async function pollSystemHealth() {
    try {
        const response = await fetch(`${API_BASE}/metrics`);
        const data = await response.json();

        const { availableCapacity, bucketStatus, nextReset, systemLoad } = data;

        // STRICT: Always render exactly what the backend sends — no local state caching
        elements.metricCapacity.textContent = availableCapacity;
        elements.metricTokens.textContent = bucketStatus;
        elements.metricReset.textContent = `${nextReset}s`;
        elements.metricLoad.textContent = systemLoad;
        elements.loadProgress.style.width = `${systemLoad}%`;

        // Status color — only depends on systemLoad value
        if (systemLoad > 80) {
            elements.loadProgress.style.background = 'var(--error)';
            elements.systemStatus.textContent = 'HIGH LOAD DETECTED';
            elements.systemStatus.parentElement.style.color = 'var(--error)';
        } else {
            elements.loadProgress.style.background = 'linear-gradient(90deg, var(--primary), var(--secondary))';
            elements.systemStatus.textContent = 'SYSTEM OPERATIONAL';
            elements.systemStatus.parentElement.style.color = 'var(--success)';
        }

    } catch (err) {
        elements.systemStatus.textContent = 'BACKEND OFFLINE';
        elements.systemStatus.parentElement.style.color = 'var(--error)';
    }
}

async function fireRequest() {
    const endpoint = elements.apiEndpoint.value;
    const key = elements.apiKey.value;
    const cost = parseInt(elements.apiComplexity.value);
    const startTime = Date.now();

    // Determine type from endpoint
    const type = endpoint.includes('status') ? 'low' : 
                 endpoint.includes('orders') ? 'medium' : 
                 endpoint.includes('heavy-task') ? 'critical' : 'low';

    // Determine method from endpoint
    const isPost = endpoint.includes('orders') || endpoint.includes('heavy-task');
    const options = {
        method: isPost ? 'POST' : 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key
        }
    };

    try {
        let fetchUrl = `${API_BASE}${endpoint}`;

        if (options.method === 'POST') {
            options.body = JSON.stringify({ type: type, complexity: cost });
        } else {
            const url = new URL(fetchUrl);
            url.searchParams.append('type', type);
            fetchUrl = url.toString();
        }

        const response = await fetch(fetchUrl, options);
        const data = await response.json();

        // Extract tokens_remaining from JSON body (fallback to current state if missing)
        const remaining = data.tokens_remaining !== undefined ? data.tokens_remaining : '--';

        // No longer need manual UI update here, pollSystemHealth handles synchronization
        addLogEntry(options.method, endpoint, response.status, Date.now() - startTime, remaining);
        pollSystemHealth(); // Instant resync after request

    } catch (error) {
        addLogEntry('ERROR', endpoint, 'OFFLINE', 0, '--');
    }
}

async function fireBurst() {
    const BURST_COUNT = 10;
    elements.btnBurst.disabled = true;
    elements.btnBurst.textContent = 'BURSTING...';

    const promises = [];
    for (let i = 0; i < BURST_COUNT; i++) {
        promises.push(fireRequest());
    }

    await Promise.all(promises);
    elements.btnBurst.disabled = false;
    elements.btnBurst.textContent = '⚡ BURST MODE';
}

function addLogEntry(method, path, status, duration, remaining) {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const statusClass = status === 429 ? 'status-429' : '';
    const methodClass = `method-${method.toLowerCase()}`;

    entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-method ${methodClass}">${method}</span>
    <span class="log-path">${path}</span>
    <span class="log-status ${statusClass}">${status}</span>
    <span class="log-info" style="color: var(--text-muted)">${duration}ms | REM: ${remaining}</span>
  `;

    elements.logDisplay.prepend(entry);
}

init();
