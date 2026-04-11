import './style.css'

const API_BASE = 'http://localhost:3000';

const elements = {
    historyTableBody: document.getElementById('history-table-body'),
    historyFilterStatus: document.getElementById('history-filter-status'),
    historySearchUser: document.getElementById('history-search-user'),
    historyEmpty: document.getElementById('history-empty'),
    statSuccess: document.getElementById('stat-success'),
    statFailed: document.getElementById('stat-failed'),
    statUsers: document.getElementById('stat-users')
};

let pollInterval = null;

function init() {
    if (!localStorage.getItem('sentinel_session')) {
        window.location.href = '/index.html';
        return;
    }

    elements.historyFilterStatus.addEventListener('change', fetchHistory);
    elements.historySearchUser.addEventListener('input', fetchHistory);

    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchHistory, 3000);
    fetchHistory();
}

async function fetchHistory() {
    const status = elements.historyFilterStatus.value;
    const username = elements.historySearchUser.value;

    try {
        const url = new URL(`${API_BASE}/auth/history`);
        if (status !== 'ALL') url.searchParams.append('status', status);
        if (username) url.searchParams.append('username', username);

        const response = await fetch(url);
        const history = await response.json();

        updateStats(history);
        renderTable(history);
    } catch (err) {
        console.error('History fetch error:', err);
    }
}

function updateStats(history) {
    const success = history.filter(h => h.status === 'SUCCESS').length;
    const failed = history.filter(h => h.status === 'FAILED').length;
    const users = new Set(history.map(h => h.username)).size;

    elements.statSuccess.textContent = success;
    elements.statFailed.textContent = failed;
    elements.statUsers.textContent = users;
}

function renderTable(history) {
    if (history.length === 0) {
        elements.historyTableBody.innerHTML = '';
        elements.historyEmpty.style.display = 'block';
        return;
    }

    elements.historyEmpty.style.display = 'none';
    elements.historyTableBody.innerHTML = history.map(entry => `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${entry.status === 'SUCCESS' ? 'var(--success)' : 'var(--error)'}"></div>
                    <strong>${entry.username}</strong>
                </div>
            </td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">${entry.email || 'N/A'}</td>
            <td>${new Date(entry.timestamp).toLocaleString()}</td>
            <td><code>${entry.ip}</code></td>
            <td>
                <span class="status-tag ${entry.status.toLowerCase()}">${entry.status}</span>
            </td>
            <td style="text-align: center;">${entry.attemptCount}</td>
            <td style="font-size: 0.75rem; color: var(--text-muted)">${entry.failureReason || '—'}</td>
        </tr>
    `).join('');
}

init();
