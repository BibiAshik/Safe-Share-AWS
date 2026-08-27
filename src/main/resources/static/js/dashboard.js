/* ============================================
   SafeShare — Dashboard Module
   File list, search, pagination, delete, revoke
   ============================================ */

let currentPage = 0;
let currentSearch = '';
let totalPages = 0;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!isAuthenticated()) {
        window.location.href = '/index.html';
        return;
    }

    // Handle OAuth2 token from URL fragment
    const hash = window.location.hash;
    if (hash && hash.startsWith('#token=')) {
        const token = hash.substring(7);
        localStorage.setItem('safeshare_token', token);
        window.location.hash = '';

        // Fetch user info (we need to decode from token or just set generic)
        // For now set a placeholder — the dashboard will work with just the token
        if (!localStorage.getItem('safeshare_user')) {
            localStorage.setItem('safeshare_user', JSON.stringify({ name: 'User', email: '' }));
        }
    }

    setupDashboard();
    loadFiles();
});

function setupDashboard() {
    // Set user greeting
    const user = getUser();
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    if (user && userNameEl) {
        userNameEl.textContent = user.name || 'User';
    }
    if (user && userAvatarEl) {
        userAvatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = e.target.value.trim();
                currentPage = 0;
                loadFiles();
            }, 300);
        });
    }
}

async function loadFiles() {
    const tableBody = document.getElementById('fileTableBody');
    const emptyState = document.getElementById('emptyState');
    const paginationEl = document.getElementById('pagination');

    if (!tableBody) return;

    let url = `/api/files?page=${currentPage}&size=10`;
    if (currentSearch) {
        url += `&search=${encodeURIComponent(currentSearch)}`;
    }

    try {
        const data = await apiGet(url);
        if (!data) return;

        totalPages = data.totalPages;
        const files = data.content;

        if (files.length === 0 && currentPage === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            if (paginationEl) paginationEl.innerHTML = '';
            updateStats(0, 0, 0);
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        // Render table rows
        tableBody.innerHTML = files.map(file => renderFileRow(file)).join('');
        renderPagination(paginationEl, data);

        // Stats
        updateStats(data.totalElements, files.reduce((sum, f) => sum + (f.shareLinks?.length || 0), 0), 0);

    } catch (error) {
        showToast('Failed to load files', 'error');
    }
}

function renderFileRow(file) {
    const iconClass = getFileIconClass(file.fileType);
    const iconLabel = getFileIconLabel(file.fileType);
    const fileType = (file.fileType || '').toLowerCase();
    const activeLinks = file.shareLinks?.filter(l => l.isActive).length || 0;
    const totalDownloads = file.shareLinks?.reduce((sum, l) => sum + (l.currentDownloads || 0), 0) || 0;

    return `
        <tr>
            <td>
                <div class="file-name">
                    <div class="file-icon ${iconClass}">${iconLabel}</div>
                    <div>
                        <div>${escapeHtml(file.originalFilename)}</div>
                        <div class="text-muted" style="font-size:12px">${formatSize(file.currentSize || 0)}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge badge-version">v${file.currentVersion || 1}</span></td>
            <td>${activeLinks} active</td>
            <td>${totalDownloads}</td>
            <td>${formatDate(file.createdAt)}</td>
            <td>
                <div class="file-actions">
                    <button class="btn btn-primary btn-sm" onclick="openShareModal(${file.id}, '${fileType}')">Share</button>
                    <button class="btn btn-links btn-sm" onclick="showFileLinks(${file.id})">Links</button>
                    <button class="btn btn-version btn-sm" onclick="showVersionHistory(${file.id})">Version</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteFile(${file.id}, '${escapeHtml(file.originalFilename)}')">Delete</button>
                </div>
            </td>
        </tr>
    `;
}

function renderPagination(container, data) {
    if (!container || data.totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }

    let html = '';

    // Previous
    html += `<button ${data.first ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">‹</button>`;

    // Page numbers
    for (let i = 0; i < data.totalPages; i++) {
        if (data.totalPages > 7) {
            // Show first, last, and nearby pages
            if (i === 0 || i === data.totalPages - 1 || Math.abs(i - currentPage) <= 1) {
                html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i + 1}</button>`;
            } else if (Math.abs(i - currentPage) === 2) {
                html += `<button disabled>…</button>`;
            }
        } else {
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i + 1}</button>`;
        }
    }

    // Next
    html += `<button ${data.last ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">›</button>`;

    container.innerHTML = html;
}

function goToPage(page) {
    if (page < 0 || page >= totalPages) return;
    currentPage = page;
    loadFiles();
}

function updateStats(totalFiles, totalLinks, totalDownloads) {
    const el1 = document.getElementById('statFiles');
    const el2 = document.getElementById('statLinks');
    const el3 = document.getElementById('statDownloads');
    if (el1) el1.textContent = totalFiles;
    if (el2) el2.textContent = totalLinks;
    if (el3) el3.textContent = totalDownloads;
}

async function deleteFile(fileId, filename) {
    const confirmed = await showConfirm(
        'Delete File',
        `This will also delete all versions and disable all share links for "${filename}". Continue?`
    );
    if (!confirmed) return;

    try {
        await apiDelete(`/api/files/${fileId}`);
        showToast('File deleted', 'success');
        loadFiles();
    } catch (error) {
        showToast(error.message || 'Delete failed', 'error');
    }
}

// ---- Version History ----
async function showVersionHistory(fileId) {
    const modal = document.getElementById('versionModal');
    if (!modal) return;

    const body = modal.querySelector('.modal-body') || modal.querySelector('.card-body');
    if (body) body.innerHTML = '<div class="text-center text-muted" style="padding:20px">Loading...</div>';

    openModal(modal);

    try {
        const versions = await apiGet(`/api/files/${fileId}/versions`);

        if (versions.length === 0) {
            body.innerHTML = `
                <div class="version-modal-actions">
                    <button class="btn btn-version btn-sm" onclick="uploadNewVersion(${fileId})">Update Version</button>
                </div>
                <div class="empty-state"><p>No versions found</p></div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="version-modal-actions">
                <button class="btn btn-version btn-sm" onclick="uploadNewVersion(${fileId})">Update Version</button>
            </div>
            <ul class="version-list">
                ${versions.map(v => `
                    <li class="version-item">
                        <div class="version-info">
                            <span class="version-number">v${v.versionNumber}</span>
                            <div>
                                <div class="version-meta">${formatDate(v.uploadedAt)} · ${formatSize(v.fileSize)}</div>
                            </div>
                        </div>
                        <div class="version-actions">
                            <a href="/api/files/${fileId}/versions/${v.id}/download" class="btn btn-secondary btn-sm" target="_blank">Download</a>
                            <button class="btn btn-ghost btn-sm" onclick="revertToVersion(${fileId}, ${v.id}, ${v.versionNumber})">Revert</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (error) {
        body.innerHTML = `<div class="text-center text-danger" style="padding:20px">${error.message}</div>`;
    }
}

async function revertToVersion(fileId, versionId, versionNumber) {
    const confirmed = await showConfirm(
        'Revert Version',
        `This will create a new version copying v${versionNumber}'s content. History is preserved. Continue?`
    );
    if (!confirmed) return;

    try {
        const result = await apiPost(`/api/files/${fileId}/versions/${versionId}/revert`, {});
        showToast(`Reverted! New version v${result.versionNumber} created`, 'success');
        showVersionHistory(fileId);
        loadFiles();
    } catch (error) {
        showToast(error.message || 'Revert failed', 'error');
    }
}

// ---- File Links View ----
async function showFileLinks(fileId) {
    const modal = document.getElementById('linksModal');
    if (!modal) return;

    const body = modal.querySelector('.modal-body') || modal.querySelector('.card-body');
    if (body) body.innerHTML = '<div class="text-center text-muted" style="padding:20px">Loading...</div>';

    openModal(modal);

    try {
        const links = await apiGet(`/api/links/file/${fileId}`);

        if (links.length === 0) {
            body.innerHTML = '<div class="empty-state"><h3>No share links</h3><p>Create a share link for this file first.</p></div>';
            return;
        }

        body.innerHTML = links.map(link => renderLinkItem(link, fileId)).join('');
    } catch (error) {
        body.innerHTML = `<div class="text-center text-danger" style="padding:20px">${error.message}</div>`;
    }
}

function renderLinkItem(link, fileId) {
    const statusBadge = link.isActive
        ? '<span class="badge badge-active">Active</span>'
        : '<span class="badge badge-revoked">Revoked</span>';
    const isPdf = (link.fileType || '').toLowerCase() === 'pdf';

    return `
        <div class="link-item">
            <div class="link-item-header">
                ${statusBadge}
                <span class="text-muted" style="font-size:12px">${formatDate(link.createdAt)}</span>
            </div>
            <div class="share-link-box">
                <input type="text" value="${link.shareUrl}" readonly id="link-${link.id}">
                <button class="btn btn-sm btn-secondary" onclick="copyLink('link-${link.id}')">Copy</button>
            </div>
            <div class="link-item-stats">
                <span>📥 ${link.currentDownloads}${link.maxDownloads ? '/' + link.maxDownloads : ''} downloads</span>
                <span>⏰ ${link.expiryTime ? formatDate(link.expiryTime) : 'No expiry'}</span>
                <span>${link.hasPassword ? '🔒 Password' : '🔓 No password'}</span>
                <span>${isPdf && link.watermarkEnabled ? '💧 Watermark' : ''}</span>
            </div>
            <div class="link-item-actions">
                <button class="btn btn-primary btn-sm" onclick="openUpdateLinkModal(${fileId}, '${encodeURIComponent(JSON.stringify(link))}')">Update Link</button>
                ${link.isActive ? `<button class="btn btn-danger btn-sm" onclick="revokeLink(${link.id})">Revoke</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="showQrCode(${link.id})">QR Code</button>
                <button class="btn btn-secondary btn-sm" onclick="showAccessLogs(${link.id})">View Logs</button>
            </div>
        </div>
    `;
}

function copyLink(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Link copied!', 'success');
    });
}

async function revokeLink(linkId) {
    const confirmed = await showConfirm(
        'Revoke Link',
        'This will immediately block access to this link. Continue?'
    );
    if (!confirmed) return;

    try {
        await apiPatch(`/api/links/${linkId}/revoke`);
        showToast('Link revoked', 'success');
        loadFiles();

        // Close links modal if open
        const modal = document.getElementById('linksModal');
        if (modal && modal.classList.contains('active')) {
            closeModal(modal);
        }
    } catch (error) {
        showToast(error.message || 'Revoke failed', 'error');
    }
}

function openUpdateLinkModal(fileId, encodedLink) {
    const link = JSON.parse(decodeURIComponent(encodedLink));
    const isPdf = (link.fileType || '').toLowerCase() === 'pdf';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'updateLinkModal';

    overlay.innerHTML = `
        <div class="modal modal-wide">
            <div class="modal-header">
                <h2>Update Link</h2>
                <button class="modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="card-body">
                <form id="updateLinkForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="updateExpiry">Expiry Date & Time</label>
                            <input type="datetime-local" class="form-control" id="updateExpiry" value="${toDateTimeLocal(link.expiryTime)}">
                        </div>
                        <div class="form-group">
                            <label for="updateMaxDownloads">Max Downloads</label>
                            <input type="number" class="form-control" id="updateMaxDownloads" min="${link.currentDownloads || 0}" value="${link.maxDownloads || ''}" placeholder="No limit">
                            <div class="text-muted" style="font-size:12px;margin-top:4px">Current downloads stay at ${link.currentDownloads || 0}</div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="updatePassword">Password</label>
                        <input type="password" class="form-control" id="updatePassword" placeholder="${link.hasPassword ? 'Leave blank to keep current password' : 'Enter password to protect link'}">
                    </div>
                    ${link.hasPassword ? `
                        <div class="form-group">
                            <label class="toggle-wrapper">
                                <input type="checkbox" id="removePassword">
                                <span>Remove existing password</span>
                            </label>
                        </div>
                    ` : ''}
                    ${isPdf ? `
                    <div class="form-group">
                        <div class="toggle-wrapper">
                            <input type="checkbox" class="toggle" id="updateWatermark" ${link.watermarkEnabled ? 'checked' : ''}>
                            <label for="updateWatermark" style="margin-bottom:0;cursor:pointer">Enable PDF watermark</label>
                        </div>
                    </div>
                    ` : ''}
                    <button type="submit" class="btn btn-primary btn-lg" style="width:100%;margin-top:8px">Update Link</button>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    overlay.querySelector('.modal-close').addEventListener('click', () => closeUpdateLinkModal(overlay));
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeUpdateLinkModal(overlay);
    });

    overlay.querySelector('#updateLinkForm').addEventListener('submit', (event) => {
        handleUpdateLink(event, fileId, link, overlay);
    });
}

async function handleUpdateLink(event, fileId, link, overlay) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Updating...';

    const expiryValue = document.getElementById('updateExpiry')?.value;
    const maxDownloadsValue = document.getElementById('updateMaxDownloads')?.value;
    const passwordValue = document.getElementById('updatePassword')?.value;
    const removePassword = document.getElementById('removePassword')?.checked;
    const isPdf = (link.fileType || '').toLowerCase() === 'pdf';
    const watermarkEnabled = isPdf && document.getElementById('updateWatermark')?.checked;

    const body = {
        maxDownloads: maxDownloadsValue ? parseInt(maxDownloadsValue) : null,
        watermarkEnabled: watermarkEnabled || false
    };

    if (expiryValue) {
        body.expiryTime = new Date(expiryValue).toISOString();
    }

    if (removePassword) {
        body.password = '';
    } else if (passwordValue && passwordValue.trim()) {
        body.password = passwordValue;
    }

    try {
        await apiPut(`/api/links/${link.id}`, body);
        showToast('Link updated', 'success');
        closeUpdateLinkModal(overlay);
        showFileLinks(fileId);
        loadFiles();
    } catch (error) {
        showToast(error.message || 'Update failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Link';
    }
}

function closeUpdateLinkModal(overlay) {
    overlay.remove();
    if (!document.querySelector('.modal-overlay.active')) {
        document.body.style.overflow = '';
    }
}

function toDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
}

// ---- QR Code ----
async function showQrCode(linkId) {
    const modal = document.getElementById('qrModal');
    if (!modal) return;

    const body = modal.querySelector('.modal-body') || modal.querySelector('.card-body');

    body.innerHTML = '<div class="text-center text-muted" style="padding:20px">Loading QR Code...</div>';
    openModal(modal);

    try {
        const response = await apiFetch(`/api/links/${linkId}/qrcode`);
        if (!response || !response.ok) throw new Error('Failed to load QR code');

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        body.innerHTML = `
            <div class="qr-container">
                <img src="${imageUrl}" alt="QR Code" onerror="this.alt='Failed to load QR code'">
                <p class="text-muted" style="margin-top:12px;font-size:13px">Scan to open the share link</p>
            </div>
        `;
    } catch (error) {
        body.innerHTML = `<div class="text-center text-danger" style="padding:20px">Failed to load QR Code.</div>`;
    }
}

// ---- Access Logs ----
async function showAccessLogs(linkId) {
    const modal = document.getElementById('logsModal');
    if (!modal) return;

    const body = modal.querySelector('.modal-body') || modal.querySelector('.card-body');
    body.innerHTML = '<div class="text-center text-muted" style="padding:20px">Loading...</div>';

    openModal(modal);

    try {
        const data = await apiGet(`/api/links/${linkId}/logs?page=0&size=50`);
        const logs = data.content;

        if (logs.length === 0) {
            body.innerHTML = '<div class="empty-state"><h3>No access logs</h3><p>No one has accessed this link yet.</p></div>';
            return;
        }

        body.innerHTML = `
            <table class="logs-table">
                <thead>
                    <tr>
                        <th>IP Address</th>
                        <th>Browser</th>
                        <th>Device</th>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td>${escapeHtml(log.ipAddress || '-')}</td>
                            <td>${escapeHtml(log.browser || '-')}</td>
                            <td>${escapeHtml(log.device || '-')}</td>
                            <td><span class="badge ${log.status === 'SUCCESS' ? 'badge-active' : 'badge-revoked'}">${log.status}</span></td>
                            <td>${escapeHtml(log.reason || '-')}</td>
                            <td>${formatDate(log.accessedAt)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        body.innerHTML = `<div class="text-center text-danger" style="padding:20px">${error.message}</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
