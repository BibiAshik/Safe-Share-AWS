/* ============================================
   SafeShare — Share Link Creation Module
   Create/edit links with settings
   ============================================ */

function openShareModal(fileId, fileType = '') {
    const modal = document.getElementById('shareModal');
    if (!modal) return;

    // Reset form
    const form = document.getElementById('shareLinkForm');
    if (form) form.reset();

    // Reset UI state
    const formContainer = document.getElementById('shareFormContainer');
    const successContainer = document.getElementById('shareSuccessContainer');
    if (formContainer && successContainer) {
        formContainer.classList.remove('hidden');
        successContainer.classList.add('hidden');
        successContainer.innerHTML = ''; // Clear old success data
    }

    // Store fileId for submission
    modal.dataset.fileId = fileId;
    modal.dataset.fileType = (fileType || '').toLowerCase();

    const isPdf = modal.dataset.fileType === 'pdf';
    const watermarkGroup = document.getElementById('shareWatermarkGroup');
    const watermarkInput = document.getElementById('shareWatermark');
    if (watermarkGroup) {
        watermarkGroup.classList.toggle('hidden', !isPdf);
    }
    if (watermarkInput) {
        watermarkInput.checked = false;
        watermarkInput.disabled = !isPdf;
    }

    // Set default expiry to 7 days from now
    const expiryInput = document.getElementById('shareExpiry');
    if (expiryInput) {
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 7);
        expiryInput.value = defaultExpiry.toISOString().slice(0, 16);
    }

    // Set default max downloads
    const maxDownloadsInput = document.getElementById('shareMaxDownloads');
    if (maxDownloadsInput) {
        maxDownloadsInput.value = 10;
    }

    openModal(modal);
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('shareLinkForm');
    if (form) {
        form.addEventListener('submit', handleCreateShareLink);
    }
});

async function handleCreateShareLink(e) {
    e.preventDefault();

    const modal = document.getElementById('shareModal');
    const fileId = modal?.dataset.fileId;
    if (!fileId) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Generating...';

    const expiryValue = document.getElementById('shareExpiry')?.value;
    const maxDownloads = document.getElementById('shareMaxDownloads')?.value;
    const password = document.getElementById('sharePassword')?.value;
    const isPdf = (modal?.dataset.fileType || '').toLowerCase() === 'pdf';
    const watermark = isPdf && document.getElementById('shareWatermark')?.checked;

    const body = {
        fileId: parseInt(fileId),
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
        watermarkEnabled: watermark || false
    };

    if (expiryValue) {
        body.expiryTime = new Date(expiryValue).toISOString();
    }

    if (password && password.trim()) {
        body.password = password;
    }

    try {
        const result = await apiPost('/api/links', body);

        // Show the generated link
        showGeneratedLink(result, modal);

        showToast('Share link created!', 'success');
        loadFiles();

    } catch (error) {
        showToast(error.message || 'Failed to create link', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate Link';
    }
}

function showGeneratedLink(linkData, modal) {
    const formContainer = document.getElementById('shareFormContainer');
    const successContainer = document.getElementById('shareSuccessContainer');
    if (!formContainer || !successContainer) return;

    // Toggle visibility
    formContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');

    successContainer.innerHTML = `
        <div style="text-align:center;padding:20px 0">
            <div style="font-size:40px;margin-bottom:12px">🔗</div>
            <h3 style="margin-bottom:16px;font-size:18px">Link Created!</h3>

            <div class="share-link-box" style="margin-bottom:20px">
                <input type="text" value="${linkData.shareUrl}" readonly id="generatedLink">
                <button class="btn btn-primary btn-sm" onclick="copyLink('generatedLink')">Copy</button>
            </div>

            <div class="qr-container" style="padding:0;margin-bottom:16px" id="successQrContainer">
                <div class="text-muted" style="font-size:13px">Loading QR Code...</div>
            </div>

            <div class="link-item-stats" style="justify-content:center;margin-bottom:20px">
                <span>📥 Max: ${linkData.maxDownloads || '∞'}</span>
                <span>⏰ ${linkData.expiryTime ? formatDate(linkData.expiryTime) : 'No expiry'}</span>
                <span>${linkData.hasPassword ? '🔒 Password' : '🔓 Open'}</span>
            </div>

            <button class="btn btn-secondary" onclick="closeModal(document.getElementById('shareModal'))">Close</button>
        </div>
    `;

    // Fetch QR Code securely
    const qrContainer = successContainer.querySelector('#successQrContainer');
    if (qrContainer && linkData.id) {
        apiFetch(`/api/links/${linkData.id}/qrcode`)
            .then(response => {
                if (!response || !response.ok) throw new Error();
                return response.blob();
            })
            .then(blob => {
                const imageUrl = URL.createObjectURL(blob);
                qrContainer.innerHTML = `<img src="${imageUrl}" alt="QR Code" style="width:180px;height:180px">`;
            })
            .catch(() => {
                qrContainer.innerHTML = `<div class="text-danger">Failed to load QR Code</div>`;
            });
    }
}
