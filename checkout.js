import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Package Configuration
let packages = {
    'UMKM': [],
    'SOSMED': [],
    'CUSTOM': [{ id: 'custom-1', name: 'Paket Trending', price: 2000000, features: ['Trending Topic', 'Massive Comments'] }]
};

async function fetchPackagesForCheckout() {
    try {
        const { data, error } = await supabase.from('packages').select('*');
        if (error) {
            console.error('❌ Checkout: Failed to fetch packages:', error.message);
            return;
        }
        if (data && data.length > 0) {
            // Reset and Rebuild Dynamically (keep Custom)
            const customPkg = packages.CUSTOM || [];
            packages = { 'CUSTOM': customPkg };

            data.forEach(p => {
                if (!packages[p.category]) {
                    packages[p.category] = [];
                }
                packages[p.category].push(p);
            });
            console.log('✅ Checkout packages loaded:', Object.keys(packages));
        } else {
            console.warn('⚠️ Checkout: No packages returned from database');
        }
    } catch (err) {
        console.error('❌ Checkout: Unexpected error fetching packages:', err);
    }
}

// Initial Fetch
fetchPackagesForCheckout();

// DOM Elements
// DOM Elements
const checkoutModal = document.getElementById('checkoutModal');
const paymentModal = document.getElementById('paymentModal');
const checkoutForm = document.getElementById('checkoutForm');
const uniqueAmountDisplay = document.getElementById('uniqueAmount');
const totalTransferDisplay = document.getElementById('totalTransfer');

// Custom Select Elements
const packageIdInput = document.getElementById('packageIdInput');
const customSelectTrigger = document.getElementById('customSelectTrigger');
const customSelectLabel = document.getElementById('customSelectLabel');
const customSelectOptions = document.getElementById('customSelectOptions');

const platformSelect = document.getElementById('platformSelect');
const platformContainer = document.getElementById('platformContainer');
const displayPkgPrice = document.getElementById('displayPkgPrice');
const packageDetails = document.getElementById('packageDetails'); // Keeping this if we still want static details below, or maybe remove? User wants list.

let currentUniquePrice = 0;
let selectedCategory = '';
let adminWhatsapp = '6281234567890'; // Default

// Fetch Admin WA
async function fetchAdminWa() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_whatsapp').single();
    if (data) adminWhatsapp = data.value;
}
window.fetchAdminWa = fetchAdminWa;
fetchAdminWa();

// Open Checkout Modal
window.openCheckout = (category, platform = null, packageId = null) => {
    try {
        console.log('🛒 openCheckout called:', { category, platform, packageId });
        selectedCategory = category;

        // GMaps / Business Logic Visibility
        const gmapsFields = document.getElementById('checkoutGmapsFields');
        if (gmapsFields) {
            const isGmaps = category.toLowerCase().includes('maps') || category.toLowerCase().includes('google') || category.toLowerCase().includes('bisnis');
            if (isGmaps) {
                gmapsFields.classList.remove('hidden');
                gmapsFields.classList.add('block');
            } else {
                gmapsFields.classList.add('hidden');
                gmapsFields.classList.remove('block');
            }
        }

        // Reset Form State
        resetCustomSelect();
        if (packageDetails) packageDetails.classList.add('hidden');
        if (displayPkgPrice) displayPkgPrice.textContent = '';

        // Default platform select to empty
        if (platformSelect) platformSelect.value = "";

        if (category === 'SOSMED') {
            // Show Platform Select
            platformContainer.classList.remove('hidden');
            disableCustomSelect(true);

            // Pre-select Platform if provided
            if (platform) {
                platformSelect.value = platform;
                const filteredPackages = (packages.SOSMED || []).filter(p =>
                    (p.sub_category && p.sub_category.toLowerCase() === platform.toLowerCase())
                );
                disableCustomSelect(false);
                populatePackageDropdown(filteredPackages);

                // Pre-select Package if provided and platform is valid
                if (packageId) {
                    const pkg = filteredPackages.find(p => p.id === packageId);
                    if (pkg) {
                        selectPackage(pkg.id, pkg.name, pkg.price, JSON.stringify(pkg.features || []));
                    }
                }
            }

        } else {
            // Hide Platform Select
            if (platformContainer) platformContainer.classList.add('hidden');
            disableCustomSelect(false);

            // Populate Packages immediately for non-SOSMED categories
            let categoryPackages = packages[category] || [];
            console.log(`📦 Packages for "${category}":`, categoryPackages.length, 'items');

            populatePackageDropdown(categoryPackages);

            // Pre-select Package if provided
            if (packageId) {
                const pkg = categoryPackages.find(p => p.id == packageId);
                if (pkg) {
                    window.selectPackage(pkg.id, pkg.name, pkg.price, JSON.stringify(pkg.features || []));
                }
            }
        }

        checkoutModal.classList.remove('hidden');
        checkoutModal.classList.add('flex');
    } catch (err) {
        console.error('❌ openCheckout error:', err);
        // Still try to show the modal even if something else failed
        if (checkoutModal) {
            checkoutModal.classList.remove('hidden');
            checkoutModal.classList.add('flex');
        }
    }
};

// Handle Platform Change (SOSMED only)
platformSelect.addEventListener('change', (e) => {
    const platform = e.target.value;
    const filteredPackages = packages.SOSMED.filter(p =>
        (p.sub_category && p.sub_category.toLowerCase() === platform.toLowerCase())
    );

    disableCustomSelect(false);
    populatePackageDropdown(filteredPackages);

    // Reset details
    resetCustomSelect();
});

// Custom Select Logic
function disableCustomSelect(disabled) {
    if (disabled) {
        customSelectTrigger.classList.add('opacity-50', 'cursor-not-allowed');
        customSelectTrigger.disabled = true;
    } else {
        customSelectTrigger.classList.remove('opacity-50', 'cursor-not-allowed');
        customSelectTrigger.disabled = false;
    }
}

function resetCustomSelect() {
    packageIdInput.value = "";
    customSelectLabel.textContent = window.getTranslation ? window.getTranslation('optionSelectPackage') : "-- Pilih Paket --";
    customSelectLabel.classList.remove('text-white');
    customSelectLabel.classList.add('text-gray-400');
    displayPkgPrice.textContent = '';
}

// Toggle Dropdown
customSelectTrigger.addEventListener('click', () => {
    customSelectOptions.classList.toggle('hidden');
});

// Close when clicking outside
document.addEventListener('click', (e) => {
    if (!customSelectTrigger.contains(e.target) && !customSelectOptions.contains(e.target)) {
        customSelectOptions.classList.add('hidden');
    }
});

// DOM Elements
const instructionsContainer = document.getElementById('instructionsContainer');
const cInstructions = document.getElementById('cInstructions'); // Add this for optional modification

function populatePackageDropdown(pkgs) {
    // Sort by price
    pkgs.sort((a, b) => a.price - b.price);

    customSelectOptions.innerHTML = pkgs.map(pkg => {
        // Features vertical list
        const featuresList = (pkg.features && pkg.features.length)
            ? `<ul class="mt-2 space-y-1">
                ${pkg.features.map(f => {
                const cleanF = f.replace(/\s*@\d+/g, '').trim();
                return `<li class="flex items-start text-xs text-gray-400"><span class="mr-2 text-accent">•</span> ${cleanF}</li>`;
            }).join('')}
               </ul>`
            : '';

        // Encode features safely for HTML attribute
        // encodeURIComponent leaves single quotes alone, so we must manually escape them for the onclick string
        const featuresJson = encodeURIComponent(JSON.stringify(pkg.features || [])).replace(/'/g, "%27");
        const safeName = pkg.name.replace(/'/g, "\\'");

        return `
        <div class="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition"
             onclick="selectPackage('${pkg.id}', '${safeName}', ${pkg.price}, '${featuresJson}')">
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-white">${pkg.name}</span>
                <span class="font-bold text-gold">Rp ${pkg.price.toLocaleString('id-ID')}</span>
            </div>
            ${featuresList}
        </div>
        `;
    }).join('');
}

// Global selection handler for the custom dropdown items
window.selectPackage = (id, name, price, featuresJson) => {
    console.log('selectPackage called:', { id, name, featuresJson }); // DEBUG Log

    const packageIdInput = document.getElementById('packageIdInput');
    const customSelectLabel = document.getElementById('customSelectLabel');
    const customSelectOptions = document.getElementById('customSelectOptions');
    const displayPkgPrice = document.getElementById('displayPkgPrice');

    // Elements for Instructions Logic
    const instructionsContainer = document.getElementById('instructionsContainer');
    const cInstructions = document.getElementById('cInstructions');

    packageIdInput.value = id;
    customSelectLabel.textContent = `${name} - Rp ${price.toLocaleString('id-ID')}`;
    customSelectLabel.classList.remove('text-gray-400');
    customSelectLabel.classList.add('text-white');

    // Update Price Display (Top)
    displayPkgPrice.textContent = 'Rp ' + price.toLocaleString('id-ID');

    // Check if instructions needed
    let features = [];
    try {
        if (featuresJson && typeof featuresJson === 'string') {
            // decodeURIComponent handles %xx escapes.
            // If it's a raw JSON string (from openCheckout direct call), decodeURIComponent acts as identity or throws if % is present.
            // We should be careful. Ideally consistent encoding.
            const decoded = decodeURIComponent(featuresJson);
            features = JSON.parse(decoded);
        }
    } catch (e) {
        console.error("Failed to parse features", e);
        // Fallback: try parsing directly if decode failed (e.g. raw json with %)
        try { features = JSON.parse(featuresJson); } catch (err) { }
    }

    const needsInstructions = features.some(f => {
        const lower = f.toLowerCase();
        return lower.includes('komentar') ||
            lower.includes('comment') ||
            lower.includes('ulasan') ||
            lower.includes('review') ||
            lower.includes('rate') ||
            lower.includes('rating') ||
            lower.includes('testimoni') ||
            lower.includes('custom');
    }) || name.toLowerCase().includes('custom') || name.toLowerCase().includes('komentar');

    // Override: Hide Instructions for Gmaps/UMKM (Use "Detail Bisnis" instead)
    if (selectedCategory) {
        const cat = selectedCategory.toLowerCase();
        if (cat.includes('maps') || cat.includes('google') || cat.includes('bisnis') || cat.includes('umkm')) {
            needsInstructions = false;
        }
    }

    console.log('Needs Instructions?', needsInstructions); // DEBUG Log

    if (needsInstructions) {
        instructionsContainer.classList.remove('hidden'); // Remove hidden class
        instructionsContainer.classList.add('block');     // Ensure block display

        // Reset fields if switching packages
        const cTopic = document.getElementById('cTopic');
        const cTone = document.getElementById('cTone');
        const cPoints = document.getElementById('cPoints');
        if (cTopic) cTopic.value = '';
        if (cTone) cTone.value = 'Casual';
        if (cPoints) cPoints.value = '';

    } else {
        instructionsContainer.classList.add('hidden');
        instructionsContainer.classList.remove('block');
        // Clear values to avoid accidental submission
        const cTopic = document.getElementById('cTopic');
        const cTone = document.getElementById('cTone');
        const cPoints = document.getElementById('cPoints');
        if (cTopic) cTopic.value = '';
        if (cTone) cTone.value = 'Casual';
        if (cPoints) cPoints.value = '';
    }

    // Close dropdown
    customSelectOptions.classList.add('hidden');
};

window.closeCheckout = () => {
    checkoutModal.classList.add('hidden');
    checkoutModal.classList.remove('flex');
};

window.closePayment = () => {
    paymentModal.classList.add('hidden');
    paymentModal.classList.remove('flex');
};

// Rate Limiting
let lastSubmitTime = 0;
const SUBMIT_COOLDOWN = 30000; // 30 seconds

// Handle Checkout Submit
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Rate limit check
    const now = Date.now();
    if (now - lastSubmitTime < SUBMIT_COOLDOWN) {
        const remaining = Math.ceil((SUBMIT_COOLDOWN - (now - lastSubmitTime)) / 1000);
        alert(`Mohon tunggu ${remaining} detik sebelum mengirim pesanan lagi.`);
        return;
    }
    lastSubmitTime = now;

    const submitBtn = document.getElementById('btnCheckoutSubmit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.originalHTML = submitBtn.innerHTML; // Store original content
        submitBtn.innerHTML = '<span class="animate-pulse">Memproses...</span>';
    }

    const reEnableBtn = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            if (submitBtn.originalHTML) submitBtn.innerHTML = submitBtn.originalHTML;
        }
    };

    const clientName = document.getElementById('cName').value;
    const clientWhatsapp = document.getElementById('cWhatsapp').value;
    const socialLink = document.getElementById('cLink').value;

    // Capture Smart Context
    const cTopic = document.getElementById('cTopic');
    const cTone = document.getElementById('cTone');
    const cPoints = document.getElementById('cPoints');

    let userInstructions = null;
    // Check if fields are visible and populated
    const instructionsContainer = document.getElementById('instructionsContainer');
    if (instructionsContainer && !instructionsContainer.classList.contains('hidden')) {
        const topic = cTopic ? cTopic.value.trim() : '';
        const tone = cTone ? cTone.value : 'Casual';
        const points = cPoints ? cPoints.value.trim() : '';

        // Strict Validation: Mandatory Fields
        if (!topic || !points) {
            alert('⚠️ Mohon lengkapi Detail Instruksi (Topik Konten & Poin Penting) agar kami bisa memproses pesanan Anda.');
            reEnableBtn();
            return;
        }

        userInstructions = {
            topic: topic,
            tone: tone,
            points: points
        };
    }

    // GMaps Data Collection & Validation
    const gmapsFields = document.getElementById('checkoutGmapsFields');
    let businessNote = '';

    if (gmapsFields && !gmapsFields.classList.contains('hidden')) {
        const bName = document.getElementById('cBusinessName').value.trim();
        const bCat = document.getElementById('cBusinessCategory').value;
        const bDesc = document.getElementById('cBusinessDesc').value.trim();

        if (!bName || !bCat || !bDesc) {
            alert('⚠️ Mohon lengkapi Detail Bisnis (Nama, Kategori, Deskripsi) agar kami bisa memproses pesanan Anda dengan akurat.');
            reEnableBtn();
            return;
        }

        businessNote = `[Context AI] Nama Bisnis: ${bName}. Kategori: ${bCat}. Deskripsi: ${bDesc}.`;
    }

    const pkgId = packageIdInput.value;
    if (!pkgId) {
        alert(window.getTranslation ? window.getTranslation('alertSelectPackage') : 'Silakan pilih paket terlebih dahulu.');
        reEnableBtn();
        return;
    }

    // Find Price and Name again
    const labelText = customSelectLabel.textContent;
    const basePrice = parseInt(labelText.split(' - Rp ')[1].replace(/\./g, ''));
    let pkgNameDisplay = labelText.split(' - Rp')[0];

    if (selectedCategory === 'SOSMED') {
        const platform = platformSelect.value;
        pkgNameDisplay = `${platform} - ${pkgNameDisplay}`;
    } else {
        pkgNameDisplay = `${selectedCategory} - ${pkgNameDisplay}`;
    }

    // Validate URL
    try {
        new URL(socialLink);
    } catch (_) {
        alert(window.getTranslation ? window.getTranslation('alertInvalidLink') : 'Mohon masukkan link yang valid (awali dengan https://)');
        reEnableBtn();
        return;
    }

    const uniqueCode = Math.floor(Math.random() * 999);
    currentUniquePrice = basePrice + uniqueCode;

    // Construct Final Note
    let finalNote = businessNote;

    // Database Insert
    const payload = {
        client_name: clientName,
        client_whatsapp: clientWhatsapp,
        package_name: pkgNameDisplay,
        social_link: socialLink + (finalNote ? ` | Note: ${finalNote}` : ''),
        total_price: currentUniquePrice,
        status: 'pending',
        user_instructions: userInstructions ? userInstructions : null
    };

    const { error } = await supabase.from('orders').insert(payload);

    if (error) {
        // Fallback: If error is about missing column 'user_instructions', try again without it and append to note
        if (error.code === '42703') { // undefined_column
            console.warn('Column user_instructions missing, falling back to note appending.');
            delete payload.user_instructions;
            if (userInstructions) {
                payload.social_link += ` | Instr: ${JSON.stringify(userInstructions)}`;
            }
            const { error: retryError } = await supabase.from('orders').insert(payload);
            if (retryError) {
                alert((window.getTranslation ? window.getTranslation('alertOrderFailed') : 'Gagal membuat pesanan: ') + retryError.message);
                reEnableBtn();
                return;
            }
        } else {
            alert((window.getTranslation ? window.getTranslation('alertOrderFailed') : 'Gagal membuat pesanan: ') + error.message);
            reEnableBtn();
            return;
        }
    }

    // Show Payment Modal
    closeCheckout();
    showPaymentModal(pkgNameDisplay, currentUniquePrice);

    // Re-enable button for next time (though checkout is closed)
    reEnableBtn();
});

function showPaymentModal(pkgName, total) {
    uniqueAmountDisplay.textContent = total.toString().slice(-3);
    totalTransferDisplay.textContent = 'Rp ' + total.toLocaleString('id-ID');
    paymentModal.classList.remove('hidden');
    paymentModal.classList.add('flex');
}

// Handle "I Have Transferred"
window.confirmTransfer = () => {
    // Need to access pkgName. Store it globally or re-construct? 
    // Simplified: Just generic message or from last order context if stored.
    // For now, simpler:
    const prefix = window.getTranslation ? window.getTranslation('waMessagePrefix') : "Halo Admin Sosmed Agency, saya sudah transfer sebesar Rp ";
    const suffix = window.getTranslation ? window.getTranslation('waMessageSuffix') : ". Mohon diverifikasi. Berikut ini bukti transfernya...";
    const message = `${prefix}${currentUniquePrice.toLocaleString('id-ID')}${suffix}`;
    window.open(`https://wa.me/${adminWhatsapp}?text=${encodeURIComponent(message)}`, '_blank');

    alert(window.getTranslation ? window.getTranslation('alertTransferConfirmed') : 'Terima kasih! Admin akan memverifikasi pembayaran Anda.');
    closePayment();
};
