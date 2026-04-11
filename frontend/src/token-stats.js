// CSS is now loaded via <link> tag in HTML

const API_BASE = 'http://localhost:3000';

const elements = {
    tableBody: document.getElementById('token-stats-table-body'),
    activeUsers: document.getElementById('stat-active-users'),
    emptyState: document.getElementById('stats-empty')
};

async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/token-stats`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        renderStats(data);
    } catch (err) {
        console.error('Failed to fetch token stats:', err);
    }
}

function renderStats(stats) {
    elements.tableBody.innerHTML = '';
    elements.activeUsers.textContent = stats.length;

    if (!stats || stats.length === 0) {
        elements.emptyState.style.display = 'block';
        return;
    }

    elements.emptyState.style.display = 'none';

    stats.forEach(user => {
        const row = document.createElement('tr');
        const usagePercent = (user.tokens_used / 100) * 100;
        
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${getStatusColor(usagePercent)}"></div>
                    <span style="font-weight: 600; color: var(--text-main)">${user.username}</span>
                </div>
            </td>
            <td style="font-family: monospace; font-weight: 700;">${user.tokens_used}</td>
            <td style="font-family: monospace; font-weight: 700; color: ${user.tokens_remaining < 20 ? 'var(--error)' : 'var(--success)'}">${user.tokens_remaining}</td>
            <td style="width: 300px;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="progress-container" style="flex: 1; height: 8px; background: rgba(255,255,255,0.05); margin-top: 0; border: 1px solid rgba(255,255,255,0.05);">
                        <div class="progress-bar" style="width: ${usagePercent}%; background: ${getBarColor(usagePercent)}; box-shadow: 0 0 10px ${getBarColor(usagePercent)}33;"></div>
                    </div>
                    <span style="font-size: 0.75rem; min-width: 35px; color: var(--text-muted); font-weight: 600;">${Math.round(usagePercent)}%</span>
                </div>
            </td>
            <td>
                <span class="status-badge-inline" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); opacity: 0.8;">
                    ACTIVE
                </span>
            </td>
        `;
        elements.tableBody.appendChild(row);
    });
}

function getBarColor(percent) {
    if (percent >= 90) return 'var(--error)';
    if (percent >= 70) return 'var(--warning)';
    return 'var(--primary)';
}

function getStatusColor(percent) {
    if (percent >= 90) return 'var(--error)';
    if (percent >= 70) return 'var(--warning)';
    return 'var(--success)';
}

// Polling every 4 seconds
setInterval(fetchStats, 4000);
fetchStats();
