import { insertAiRequestApi, getAiRequestStatusApi, invokeAiFunction } from './api.js';

export const toggleCommentLogic = (platform) => {
    const commentSection = document.getElementById('mCommentLogic');
    if (platform === 'Comment' || platform === 'Multiple') {
        commentSection.classList.remove('hidden');
    } else {
        commentSection.classList.add('hidden');
    }
};

export const populatePackageSelect = () => {
    const select = document.getElementById('mPackageSelect');
    if (!select || !window.packagesData) return;

    select.innerHTML = '<option value="">-- Manual Creation --</option>';

    Object.values(window.packagesData).forEach(pkg => {
        const option = document.createElement('option');
        option.value = pkg.id;
        option.textContent = `${pkg.category} - ${pkg.name}`;
        select.appendChild(option);
    });
};

export const renderPackageSummary = (features) => {
    const summaryContainer = document.getElementById('mPackageSummary');
    const summaryList = document.getElementById('mSummaryList');
    const summaryCount = document.getElementById('mSummaryCount');
    const summaryCost = document.getElementById('mSummaryCost');

    if (!features || features.length === 0) {
        summaryContainer.classList.add('hidden');
        return;
    }

    let totalMissions = 0;
    let totalCost = 0;

    const validItems = features.map(feature => {
        const match = feature.match(/^([\d.,]+[kmKM]?)\s+(.+)/);
        if (!match) return null;

        let rawQuota = match[1].toLowerCase();
        const actionText = match[2];

        let multiplier = 1;
        if (rawQuota.includes('k')) { multiplier = 1000; rawQuota = rawQuota.replace('k', ''); }
        else if (rawQuota.includes('m')) { multiplier = 1000000; rawQuota = rawQuota.replace('m', ''); }
        rawQuota = rawQuota.replace(/,/g, '.');

        const q = Math.floor(parseFloat(rawQuota) * multiplier);
        const { type, reward } = window.mapActionAndReward(actionText);
        const cost = q * reward;

        totalMissions++;
        totalCost += cost;

        return { actionText, type, quota: q, reward, cost };
    }).filter(item => item !== null);

    if (validItems.length > 0) {
        summaryContainer.classList.remove('hidden');
        summaryCount.innerText = totalMissions;
        summaryCost.innerText = `Rp ${totalCost.toLocaleString()}`;

        summaryList.innerHTML = validItems.map(item => `
            <li class="flex items-center justify-between border-b border-blue-100 last:border-0 pb-1 last:pb-0">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-blue-400"></span>
                    <span class="font-medium text-blue-900">${item.type}</span>
                    <span class="text-xs text-gray-400">(${item.quota.toLocaleString()} slots)</span>
                </div>
                <div class="text-xs font-bold text-gray-500">
                    Rp ${item.cost.toLocaleString()}
                </div>
            </li>
        `).join('');
    } else {
        summaryContainer.classList.add('hidden');
    }
};

export const previewAiComments = async () => {
    const context = document.getElementById('mContext').value;
    const tone = document.getElementById('mTone').value;
    const btn = document.getElementById('btnAiPreview');
    const resultDiv = document.getElementById('mAiPreviewResult');
    const resultList = document.getElementById('mAiPreviewList');

    if (!context) {
        alert('Tuliskan referensi konteks terlebih dahulu!');
        return;
    }

    // Determine Quantity from Package
    let quantity = 3;
    const pkgSelect = document.getElementById('mPackageSelect');
    if (pkgSelect && pkgSelect.value && window.packagesData) {
        const pkg = window.packagesData[pkgSelect.value];
        if (pkg.features && Array.isArray(pkg.features)) {
            const reviewRegex = /(\d+)\s*(Review|Ulasan|Comment|Komentar|Rating)/i;
            let maxCount = 0;
            pkg.features.forEach(f => {
                const match = f.match(reviewRegex);
                if (match) {
                    const count = parseInt(match[1], 10);
                    if (count > maxCount) maxCount = count;
                }
            });
            if (maxCount > 0) {
                // Cap at 10 for preview to avoid excessive waiting/token usage
                // But user requested "sesuai paket". 
                // We'll trust the Edge Function loop to handle up to 10-15 reasonably.
                // If it's 50, maybe asking AI for 50 lines is risky for timeout.
                // Let's set a soft limit of 10 for "Preview". 
                // Real generation might need batching.
                quantity = Math.min(maxCount, 10);
            }
        }
    }

    btn.disabled = true;
    btn.innerHTML = `<span>⚡ Processing ${quantity} comments...</span>`;
    resultDiv.classList.add('hidden');
    resultList.innerHTML = '';

    try {
        // Direct Edge Function Call
        const { result } = await invokeAiFunction({
            context,
            tone,
            quantity
        });

        if (!result) throw new Error('No result returned from AI');

        const comments = Array.isArray(result) ? result : JSON.parse(result);

        resultList.innerHTML = comments.map(comment => `
            <div class="bg-white p-3 rounded-xl border border-purple-100 text-xs text-gray-700 shadow-sm animate-fade-in flex items-center gap-3">
                <span class="bg-purple-100 text-purple-600 w-5 h-5 flex items-center justify-center rounded-full font-bold text-[10px]">AI</span>
                <p>${comment}</p>
            </div>
        `).join('');
        resultDiv.classList.remove('hidden');

    } catch (err) {
        console.error(err);
        alert('Gagal memanggil AI: ' + (err.message || 'Unknown Error'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Preview</span>';
    }
};

export const openAiModal = (missionId) => {
    document.getElementById('aiMissionId').value = missionId;
    document.getElementById('aiModal').classList.remove('hidden');
    document.getElementById('aiModal').classList.add('flex');
};

export const closeAiModal = () => {
    document.getElementById('aiModal').classList.add('hidden');
    document.getElementById('aiModal').classList.remove('flex');
};

export const openPackageModal = (pkgId) => {
    const pkg = window.packagesData[pkgId];
    if (!pkg) {
        alert('Error: Package data not found. Please refresh.');
        return;
    }

    document.getElementById('editPkgId').value = pkg.id;
    document.getElementById('editPkgName').value = pkg.name;
    document.getElementById('editPkgCategory').value = pkg.category;
    document.getElementById('editPkgSubCategory').value = pkg.sub_category || '';
    document.getElementById('editPkgPrice').value = pkg.price;
    document.getElementById('editPkgReward').value = pkg.reward || 0;
    document.getElementById('editPkgQuota').value = pkg.default_quota || 50;
    document.getElementById('editPkgFeatures').value = pkg.features ? pkg.features.join('\n') : '';

    const modal = document.getElementById('packageModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

export const closePackageModal = () => {
    document.getElementById('packageModal').classList.add('hidden');
    document.getElementById('packageModal').classList.remove('flex');
};

export const viewImage = (url) => {
    document.getElementById('modalImg').src = url;
    document.getElementById('imageModal').classList.remove('hidden');
    document.getElementById('imageModal').classList.add('flex');
};

export const closeModal = () => {
    document.getElementById('imageModal').classList.add('hidden');
    document.getElementById('imageModal').classList.remove('flex');
};

// Global Exposure for HTML onclick
window.toggleCommentLogic = toggleCommentLogic;
window.previewAiComments = previewAiComments;
window.openAiModal = openAiModal;
window.closeAiModal = closeAiModal;
window.openPackageModal = openPackageModal;
window.closePackageModal = closePackageModal;
window.viewImage = viewImage;
window.closeModal = closeModal;
window.renderPackageSummary = renderPackageSummary;
