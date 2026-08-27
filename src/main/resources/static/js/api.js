/* ============================================
   SafeShare — Central API Wrapper
   Attaches JWT, handles 401 (session expired)
   ============================================ */

const API_BASE = '';

/**
 * Central fetch wrapper. Attaches JWT token from localStorage.
 * On 401, clears token and redirects to landing page.
 */
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('safeshare_token');

    const headers = {
        ...(options.headers || {})
    };

    // Don't set Content-Type for FormData (browser sets multipart boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    try {
        const response = await fetch(API_BASE + url, {
            ...options,
            headers
        });

        // Handle 401 — session expired
        if (response.status === 401 && !url.includes('/api/auth/')) {
            localStorage.removeItem('safeshare_token');
            localStorage.removeItem('safeshare_user');
            window.location.href = '/index.html';
            return null;
        }

        return response;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Helper: Parse JSON from response, throw on non-OK status.
 */
async function apiJson(url, options = {}) {
    const response = await apiFetch(url, options);
    if (!response) return null;

    if (response.status === 204) {
        return true;
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

/**
 * Shorthand for GET requests.
 */
async function apiGet(url) {
    return apiJson(url, { method: 'GET' });
}

/**
 * Shorthand for POST with JSON body.
 */
async function apiPost(url, body) {
    return apiJson(url, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

/**
 * Shorthand for PUT with JSON body.
 */
async function apiPut(url, body) {
    return apiJson(url, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

/**
 * Shorthand for PATCH.
 */
async function apiPatch(url, body) {
    return apiJson(url, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined
    });
}

/**
 * Shorthand for DELETE.
 */
async function apiDelete(url) {
    const response = await apiFetch(url, { method: 'DELETE' });
    if (!response) return null;
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Delete failed');
    }
    return true;
}

/**
 * Upload file via multipart form data with progress tracking.
 */
function apiUpload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const token = localStorage.getItem('safeshare_token');

        xhr.open('POST', API_BASE + url);

        if (token) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        }

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = Math.round((e.loaded / e.total) * 100);
                onProgress(percent);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 401) {
                localStorage.removeItem('safeshare_token');
                localStorage.removeItem('safeshare_user');
                window.location.href = '/index.html';
                return;
            }

            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data.message || 'Upload failed'));
                }
            } catch (e) {
                reject(new Error('Upload failed'));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.send(formData);
    });
}

/**
 * Check if user is authenticated.
 */
function isAuthenticated() {
    if (window.location.pathname.endsWith('/dashboard.html') && window.location.hash.startsWith('#token=')) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('token');
        localStorage.setItem('safeshare_token', token);
        history.replaceState(null, document.title, window.location.pathname);

        const name = params.get('name');
        const email = params.get('email');
        if (name || email || !localStorage.getItem('safeshare_user')) {
            localStorage.setItem('safeshare_user', JSON.stringify({
                name: name || 'User',
                email: email || ''
            }));
        }
    }

    return !!localStorage.getItem('safeshare_token');
}

/**
 * Get stored user info.
 */
function getUser() {
    const user = localStorage.getItem('safeshare_user');
    return user ? JSON.parse(user) : null;
}

/**
 * Show a toast notification.
 */
function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show a confirmation dialog. Returns a Promise<boolean>.
 */
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay active';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-actions">
                    <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
                    <button class="btn btn-danger" id="confirmOk">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#confirmOk').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        overlay.querySelector('#confirmCancel').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

/**
 * Format file size.
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format date string.
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    
    // AWS server sends UTC time without the Z suffix, causing browsers to assume it's already local time.
    // We append Z to force the browser to treat it as UTC and convert it to the user's actual local time.
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z')) {
        dateStr += 'Z';
    }
    
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Get file icon class based on type.
 */
function getFileIconClass(type) {
    switch (type?.toLowerCase()) {
        case 'pdf': return 'pdf';
        case 'jpg':
        case 'jpeg':
        case 'png': return 'image';
        case 'docx': return 'docx';
        case 'xls':
        case 'xlsx': return 'excel';
        case 'zip': return 'zip';
        default: return 'docx';
    }
}

/**
 * Get file icon label.
 */
function getFileIconLabel(type) {
    switch (type?.toLowerCase()) {
        case 'pdf': return 'PDF';
        case 'jpg':
        case 'jpeg': return 'JPG';
        case 'png': return 'PNG';
        case 'docx': return 'DOC';
        case 'xls': return 'XLS';
        case 'xlsx': return 'XLSX';
        case 'zip': return 'ZIP';
        default: return 'FILE';
    }
}
