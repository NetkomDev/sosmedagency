import { updateOrderStatusApi } from './api.js';
import { toggleCommentLogic, renderPackageSummary, populatePackageSelect } from './ui-handlers.js';

// --- Logic Update: Sustainable Reward Rates (Profitability Audit) ---
export const mapActionAndReward = (rawText) => {
    const text = rawText.toLowerCase();
    let type = 'Review';
    let rwd = 2000; // Default Review

    // E-Commerce Specifics
    if (/shop review|rating|bintang/i.test(text)) { type = 'SHOP_REVIEW'; rwd = 2500; }
    else if (/product like|wishlist|favorite/i.test(text)) { type = 'SHOP_FAVORITE'; rwd = 100; }
    else if (/live|stream/i.test(text)) { type = 'LIVE_TRAFFIC'; rwd = 25; }

    // Standard Social Media
    else if (/review|ulasan|gmaps|google/i.test(text)) { type = 'Review'; rwd = 2000; }
    else if (/follow|ikut|sub/i.test(text)) { type = 'Follow'; rwd = 50; }
    else if (/like|suka/i.test(text)) { type = 'Like'; rwd = 20; }
    else if (/comment|komen/i.test(text)) { type = 'Comment'; rwd = 150; }
    else if (/share|bagi/i.test(text)) { type = 'Share'; rwd = 100; }
    else if (/view|tonton|traffic/i.test(text)) { type = 'View'; rwd = 10; }

    return { type, reward: rwd };
};

export const resetManualInputs = () => {
    const platformSelect = document.getElementById('mPlatform');
    const rewardInput = document.getElementById('mReward');
    const quotaInput = document.getElementById('mQuota');
    const metricsSection = document.getElementById('manual-metrics-section');
    // GMaps Section Removed
    // const gmapsSection = document.getElementById('special-gmaps-fields');

    if (metricsSection) metricsSection.classList.remove('hidden');

    if (platformSelect) {
        platformSelect.disabled = false;
        platformSelect.classList.remove('bg-gray-100', 'cursor-not-allowed');
        // Clear previous 'Multiple' option if any
        Array.from(platformSelect.options).forEach(opt => {
            if (opt.value === 'Multiple') opt.remove();
        });
        platformSelect.value = 'Review';
    }

    if (rewardInput) {
        rewardInput.readOnly = false;
        rewardInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        rewardInput.value = '';
    }

    if (quotaInput) {
        quotaInput.readOnly = false;
        quotaInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        quotaInput.value = '';
    }

    const pkgFeatures = document.getElementById('mPackageFeatures');
    if (pkgFeatures) pkgFeatures.value = '';

    // Clear Summary
    if (window.renderPackageSummary) window.renderPackageSummary([]);
};

export const applyPackageTemplate = (pkgId) => {
    if (!pkgId) {
        resetManualInputs();
        return;
    }
    const pkg = window.packagesData[pkgId];
    if (!pkg) return;

    // HIDE Manual Metrics
    const metricsSection = document.getElementById('manual-metrics-section');
    if (metricsSection) metricsSection.classList.add('hidden');

    // Handle GMaps Specifics
    // GMaps Handling Updated: Just ensure Comment Logic is visible if needed
    if (pkg.category === 'Google Maps') {
        const commentSection = document.getElementById('mCommentLogic');
        if (commentSection) commentSection.classList.remove('hidden');
    }

    // Auto-fill and LOCK inputs (Standard Logic)
    const platformSelect = document.getElementById('mPlatform');
    const rewardInput = document.getElementById('mReward');
    const quotaInput = document.getElementById('mQuota');

    if (platformSelect) {
        // Ensure Shopee/TikTok Shop exist
        ['Shopee', 'TikTok Shop'].forEach(val => {
            // Check generic value or display text match
            let exists = false;
            for (let i = 0; i < platformSelect.options.length; i++) {
                if (platformSelect.options[i].value === val) exists = true;
            }
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = val;
                opt.innerText = val;
                platformSelect.add(opt);
            }
        });

        // Add 'Multiple' option for bundles
        let multOpt = platformSelect.querySelector('option[value="Multiple"]');
        if (!multOpt) {
            multOpt = document.createElement('option');
            multOpt.value = 'Multiple';
            multOpt.innerText = '📦 Bundle Package';
            platformSelect.add(multOpt);
        }

        // Intelligent Action Detection
        let detected = 'Multiple';
        const name = (pkg.name || '').toLowerCase();

        // Strict Feature Analysis to detect Bundle vs Single
        let typesFound = new Set();
        if (pkg.features && Array.isArray(pkg.features)) {
            pkg.features.forEach(f => {
                const lowerF = f.toLowerCase();
                if (lowerF.includes('review') || lowerF.includes('ulasan') || lowerF.includes('gmaps') || lowerF.includes('rating') || lowerF.includes('bintang')) typesFound.add('Review');
                else if (lowerF.includes('follow') || lowerF.includes('ikut')) typesFound.add('Follow');
                else if (lowerF.includes('like') || lowerF.includes('suka') || lowerF.includes('love')) typesFound.add('Like');
                else if (lowerF.includes('comment') || lowerF.includes('komen')) typesFound.add('Comment');
                else if (lowerF.includes('subscribe') || lowerF.includes('sub') || lowerF.includes('langgan')) typesFound.add('Subscribe');
                else if (lowerF.includes('share') || lowerF.includes('bagi')) typesFound.add('Share');
                else if (lowerF.includes('view') || lowerF.includes('nonton')) typesFound.add('View');
            });
        }

        if (typesFound.size > 1) {
            // It is a MIXED Bundle
            detected = 'Multiple';
        } else if (typesFound.size === 1) {
            // Single Action Type
            detected = [...typesFound][0];
        } else {
            // Fallback to Name Detection
            if (name.includes('review') || name.includes('ulasan') || name.includes('rating') || name.includes('bintang') || name.includes('gmaps')) detected = 'Review';
            else if (name.includes('follow') || name.includes('ikuti')) detected = 'Follow';
            else if (name.includes('like') || name.includes('suka') || name.includes('love')) detected = 'Like';
            else if (name.includes('comment') || name.includes('komentar')) detected = 'Comment';
            else if (name.includes('subscribe') || name.includes('sub') || name.includes('langganan')) detected = 'Subscribe';
            else if (name.includes('share') || name.includes('bagikan')) detected = 'Share';
        }

        // Check if option exists
        let hasOption = false;
        for (let i = 0; i < platformSelect.options.length; i++) {
            if (platformSelect.options[i].value === detected) hasOption = true;
        }

        platformSelect.value = hasOption ? detected : 'Multiple';

        // Enable platform select ONLY if it is 'Multiple' to allow manual check, 
        // OR keep disabled to trust system. User request implies they want to SEE the breakdown.
        // The breakdown is in the Summary View.
        platformSelect.disabled = true;

        // High Safety Visual Cue
        if (pkg.features && pkg.features.some(f => f.includes('High Safety'))) {
            platformSelect.classList.add('border-green-500', 'border-2');
            platformSelect.title = "🛡️ High Safety Mode Active (Drip Feed)";
        } else {
            platformSelect.classList.remove('border-green-500', 'border-2');
            platformSelect.title = "";
        }
        platformSelect.classList.add('bg-gray-100', 'cursor-not-allowed');
    }

    if (rewardInput) {
        rewardInput.value = 0; // Calculated dynamically per mission
        rewardInput.readOnly = true;
        rewardInput.classList.add('bg-gray-100', 'cursor-not-allowed');
    }

    if (quotaInput) {
        quotaInput.value = 0; // Calculated dynamically
        quotaInput.readOnly = true;
        quotaInput.classList.add('bg-gray-100', 'cursor-not-allowed');
    }

    const titleInput = document.getElementById('mTitle');
    if (titleInput) titleInput.value = `${pkg.sub_category || pkg.category} - ${pkg.name}`;

    const catInput = document.getElementById('mCategory');
    if (catInput) catInput.value = pkg.category;

    // Pass features to hidden field for missionForm to parse later
    if (pkg.features) {
        const featInput = document.getElementById('mPackageFeatures');
        if (featInput) featInput.value = JSON.stringify(pkg.features);

        // Update visual summary
        if (typeof renderPackageSummary === 'function') {
            renderPackageSummary(pkg.features);
        } else if (window.renderPackageSummary) {
            window.renderPackageSummary(pkg.features);
        }
    }
};


export const verifyOrder = async (orderId, fullPkgName, fullLink, orderPrice, clientName) => {
    try {
        if (!confirm(`Verifikasi pesanan untuk ${fullPkgName}? \n\nIni akan membuka form 'Create Mission' dengan data yang sudah terisi otomatis.`)) return;

        const { error: orderError } = await updateOrderStatusApi(orderId, 'verified');
        if (orderError) {
            alert('Gagal memverifikasi pesanan: ' + orderError.message);
            return;
        }

        let targetUrl = fullLink;
        let notes = '';
        if (fullLink && fullLink.includes(' | Note: ')) {
            [targetUrl, notes] = fullLink.split(' | Note: ');
        }

        const nameParts = fullPkgName ? fullPkgName.split(' - ') : ['UMKM', fullPkgName];

        let categoryPrefix = nameParts[0] || '';
        if (fullPkgName.toLowerCase().includes('instagram')) categoryPrefix = 'Instagram';
        else if (fullPkgName.toLowerCase().includes('tiktok')) categoryPrefix = 'TikTok';
        else if (fullPkgName.toLowerCase().includes('youtube')) categoryPrefix = 'YouTube';
        else if (fullPkgName.toLowerCase().includes('facebook')) categoryPrefix = 'Facebook';
        else if (fullPkgName.toLowerCase().includes('shopee')) categoryPrefix = 'Shopee';
        else if (fullPkgName.toLowerCase().includes('google') || fullPkgName.toLowerCase().includes('gmaps')) categoryPrefix = 'Google Maps';
        else categoryPrefix = 'UMKM';

        const pkgSpecificName = nameParts.slice(1).join(' - ') || fullPkgName;

        let category = categoryPrefix;
        let platform = 'Review';
        let reward = 500;
        let quota = 50;

        let foundPkg = null;
        if (window.packagesData) {
            // Robust Search: Match Name AND (Category OR Sub-Category)
            foundPkg = Object.values(window.packagesData).find(p => {
                const pName = p.name ? p.name.toLowerCase() : '';
                const targetName = pkgSpecificName.toLowerCase();
                const nameMatch = targetName.includes(pName) || pName.includes(targetName);

                // Strict Category + SubCategory Match
                // Because Database might be Category='SOSMED' and SubCategory='Instagram'
                const pCat = (p.category || '').toLowerCase();
                const pSub = (p.sub_category || '').toLowerCase();
                const targetCat = categoryPrefix.toLowerCase();

                const catMatch = pCat === targetCat || pCat.includes(targetCat) || targetCat.includes(pCat) ||
                    pSub === targetCat || pSub.includes(targetCat) || targetCat.includes(pSub);

                return nameMatch && catMatch;
            });

            // Fallback: If strict match fails, try just Name but prefer same category/sub-category
            if (!foundPkg) {
                foundPkg = Object.values(window.packagesData).find(p => {
                    const pCat = (p.category || '').toLowerCase();
                    const pSub = (p.sub_category || '').toLowerCase();
                    const targetCat = categoryPrefix.toLowerCase();
                    // Prefer same category
                    const catMatch = pCat.includes(targetCat) || pSub.includes(targetCat);
                    const nameMatch = (p.name && p.name.toLowerCase().includes(pkgSpecificName.toLowerCase()));

                    return nameMatch && catMatch;
                });
            }

            // Last Resort Fallback: Just Name match (but warn)
            if (!foundPkg) {
                foundPkg = Object.values(window.packagesData).find(p => p.name && p.name.toLowerCase().includes(pkgSpecificName.toLowerCase()));
            }

            // PRICE SAFETY CHECK
            if (foundPkg && foundPkg.price && orderPrice) {
                const priceRatio = foundPkg.price / orderPrice;
                if (priceRatio > 1.5 || priceRatio < 0.5) {
                    console.warn(`Package Price mismatch! Order: ${orderPrice}, Pkg: ${foundPkg.price}. This might be the wrong package.`);
                }
            }
        }

        if (foundPkg && foundPkg.reward) {
            reward = foundPkg.reward;
        } else {
            if (categoryPrefix.includes('TikTok')) { category = 'TikTok'; reward = 300; }
            else if (categoryPrefix.includes('YouTube')) { category = 'YouTube'; reward = 600; }
            else if (categoryPrefix.includes('Instagram')) { category = 'Instagram'; reward = 400; }
            else if (categoryPrefix.includes('Facebook')) { category = 'Facebook'; reward = 400; }
            else { category = 'UMKM'; reward = 2000; }
        }

        const lowerName = fullPkgName ? fullPkgName.toLowerCase() : '';
        if (lowerName.includes('komentar') || lowerName.includes('comment')) platform = 'Comment';
        else if (lowerName.includes('like')) platform = 'Like';
        else if (lowerName.includes('share') || lowerName.includes('bagikan')) platform = 'Share';
        else if (lowerName.includes('sub') || lowerName.includes('langganan')) platform = 'Subscribe';
        else if (lowerName.includes('follow') || lowerName.includes('ikuti')) platform = 'Follow';
        else if (lowerName.includes('review') || lowerName.includes('ulasan')) platform = 'Review';
        else {
            if (category === 'YouTube') platform = 'Subscribe';
            else if (category === 'Instagram' || category === 'TikTok') platform = 'Follow';
            else if (category === 'Facebook') platform = 'Share';
        }

        if (!foundPkg || !foundPkg.reward) {
            if (platform === 'Comment' || platform === 'Review') reward *= 2;
            if (platform === 'Like') reward = Math.max(200, reward / 2);
        }

        let quotaFromTitle = 0;
        if (foundPkg && foundPkg.default_quota) {
            quotaFromTitle = foundPkg.default_quota;
        } else {
            const numberMatch = pkgSpecificName.match(/(\d+)([kK])?/);
            if (numberMatch) {
                let num = parseInt(numberMatch[1]);
                if (numberMatch[2]) num *= 1000;
                if (num >= 50 && num < 2030) quotaFromTitle = num;
            }
        }

        if (quotaFromTitle > 0) {
            quota = quotaFromTitle;
        } else {
            const estimatedQuota = Math.floor(orderPrice / (reward * 2));
            quota = estimatedQuota > 0 ? estimatedQuota : 50;
        }

        document.getElementById('mOrderId').value = orderId;
        document.getElementById('mLink').value = targetUrl;

        const pkgSelect = document.getElementById('mPackageSelect');

        if (foundPkg) {
            // Priority: Found package
            if (pkgSelect) pkgSelect.value = foundPkg.id;
            applyPackageTemplate(foundPkg.id);

            document.getElementById('mTitle').value = `${fullPkgName}`;

            // Update category to match found package manually if needed
            // But applyPackageTemplate updates category field from package

        } else {
            // Not Found
            if (pkgSelect) pkgSelect.value = "";
            resetManualInputs();
            document.getElementById('mTitle').value = `${fullPkgName}`;

            // Set guessed category
            const catSelect = document.getElementById('mCategory');
            catSelect.value = category;

            document.getElementById('mPlatform').value = platform;
            document.getElementById('mReward').value = reward;
            document.getElementById('mQuota').value = quota;
            renderPackageSummary([]);
        }

        if (notes) {
            alert(`⚠️ Catatan dari User:\n"${notes}"\n\nSistem akan otomatis memasukkan ini ke Context AI.`);
            document.getElementById('mContext').value = notes;
            document.getElementById('mCommentLogic').classList.remove('hidden');

            // Auto-trigger AI if platform is relevant
            const currentPlatform = document.getElementById('mPlatform').value;
            if ((currentPlatform === 'Comment' || currentPlatform === 'Review') && typeof window.previewAiComments === 'function') {
                setTimeout(() => window.previewAiComments(), 800);
            }
        } else {
            document.getElementById('mContext').value = '';
            document.getElementById('mCommentLogic').classList.add('hidden');
        }

        window.showSection('missions');
        document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' });

        const formCard = document.querySelector('#missionForm').parentElement;
        if (formCard) {
            formCard.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50', 'transition-all', 'duration-500');
            setTimeout(() => formCard.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50'), 1500);
        }

        window.fetchOrders();

        if (foundPkg && pkgSelect && pkgSelect.value !== foundPkg.id) {
            pkgSelect.value = foundPkg.id;
        }

    } catch (err) {
        console.error('Error in verifyOrder:', err);
        alert('Terjadi kesalahan saat memproses pesanan: ' + err.message);
    }
};

window.mapActionAndReward = mapActionAndReward;
window.applyPackageTemplate = applyPackageTemplate;
window.resetManualInputs = resetManualInputs;
window.verifyOrder = verifyOrder;
