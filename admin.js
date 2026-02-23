import { deleteClientLinkApi, fetchAllProfilesApi, insertAiRequestApi, getAiRequestStatusApi, getMissionQuotaApi, updateMissionApi, updateSubmissionStatusApi, getProfileBalanceApi, updateProfileBalanceApi, getSubmissionMissionIdApi, updateSettingApi, fetchSettingsApi, fetchPackagesApi, updatePackageApi, fetchSubmissionsApi, fetchOrdersApi, updateOrderStatusApi, insertMissionsApi, supabase } from './api.js';
import { populatePackageSelect } from './ui-handlers.js';
import { renderOrdersHTML, renderPackagesHTML, renderActiveMissionsHTML } from './admin-render.js';
import { verifyOrder } from './mission-logic.js';

// Ensure verifyOrder is globally available for HTML onclick events
// --- REFACTORED VERIFICATION SYSTEM (Modal Based) ---
import { mapActionAndReward } from './mission-logic.js'; // Ensure this import exists if not already

// Global State for Verification
let pendingVerification = null;

window.resetOrderStatus = async (orderId) => {
    if (!confirm('Revert order status to PENDING? \nThis allows you to verify and create missions again.\nUse this if you deleted the missions and need to re-process.')) return;

    // Using locally imported api function if available, or direct supabase
    // We already have updateOrderStatusApi imported in mission-logic.js but maybe not here?
    // Let's use supabase directly to be safe as admin.js has the client.

    const { error } = await supabase.from('orders').update({ status: 'pending' }).eq('id', orderId);
    if (error) {
        alert('Error resetting order: ' + error.message);
    } else {
        alert('Order status reset to Pending.');
        if (window.fetchOrders) window.fetchOrders();
    }
};

// (Old verifyOrder removed - replaced by Atomic Version below)


// --- ACTIVE MISSIONS MANAGEMENT ---
window.fetchActiveMissions = async () => {
    const table = document.getElementById('activeMissionsTable');
    if (!table) return;

    // Fetch directly using Supabase (or create API wrapper if preferred)
    // Filter: Status != Completed (Active, Draft, Pending, etc.)
    const { data: rawMissions, error } = await supabase
        .from('missions')
        .select('*, submissions(count)')
        .eq('status', 'Active')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch Missions Error:', error);
        table.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!rawMissions || rawMissions.length === 0) {
        table.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">No active missions found.</td></tr>`;
        return;
    }

    const missions = rawMissions.map(m => {
        const takenCount = m.submissions && m.submissions.length > 0 ? m.submissions[0].count : 0;
        return {
            ...m,
            taken: takenCount,
            quota: m.quota + takenCount // UI shows: taken / quota (where quota = original total)
        };
    });

    table.innerHTML = renderActiveMissionsHTML(missions);
};

window.deleteMission = async (id) => {
    // 1. Fetch details to decide: Soft or Hard delete?
    const { data: m, error: fetchErr } = await supabase
        .from('missions')
        .select('status, submissions(count)')
        .eq('id', id)
        .single();

    if (fetchErr) {
        if (!confirm('Could not fetch mission details. Force delete anyway?')) return;
    }

    const takenCount = m && m.submissions && m.submissions.length > 0 ? m.submissions[0].count : 0;

    // 2. Logic
    if (takenCount > 0) {
        if (!confirm(`⚠️ This mission has ${takenCount} participants.\n\nCompleting/Archiving is recommended to preserve history.\nClick OK to ARCHIVE (status -> Completed).\nClick Cancel to abort.`)) return;

        const { error } = await supabase.from('missions').update({ status: 'Completed' }).eq('id', id);
        if (error) alert('Error archiving: ' + error.message);
        else fetchActiveMissions();
    } else {
        if (!confirm('Are you sure you want to PERMANENTLY DELETE this mission?')) return;

        const { error } = await supabase.from('missions').delete().eq('id', id);
        if (error) {
            // Check for FK constraint (error code 23503 in Postgres)
            if (error.code === '23503' || error.message.includes('foreign key')) {
                alert('Cannot delete: Submissions are linked to this mission.\nPlease Archive it instead.');
            } else {
                alert('Error deleting: ' + error.message);
            }
        } else {
            fetchActiveMissions();
        }
    }
};

// (Redundant active-missions-channel logic removed - handled by Initialization block below)


window.verifyOrder = async (orderId, pkgName, link, price, clientName) => {
    // Ensure packages are loaded
    if (!window.packagesData || Object.keys(window.packagesData).length === 0) {
        console.log('Packages not loaded, fetching...');
        await window.fetchPackages();
    }

    // 1. Find Package (Robust Matching)
    const packages = Object.values(window.packagesData || {});
    const targetName = (pkgName || '').toLowerCase().trim();

    // Strategy A: Exact Match (Case Insensitive)
    let pkg = packages.find(p => p.name.toLowerCase() === targetName);

    // Strategy B: "Category - Name" format (e.g. "TikTok - Sultan TT" vs "Sultan TT")
    if (!pkg && targetName.includes('-')) {
        const parts = targetName.split('-').map(s => s.trim());
        if (parts.length >= 2) {
            const potentialName = parts[1]; // "sultan tt"
            pkg = packages.find(p => p.name.toLowerCase() === potentialName);
        }
    }

    // Strategy C: Reverse Containment (if package name is inside the order string)
    if (!pkg) {
        pkg = packages.find(p => targetName.includes(p.name.toLowerCase()) && p.name.length > 3);
    }

    if (!pkg) {
        // Fallback: Check if package name contains part of the known packages or vice versa? 
        // Dangerous if simple "100" vs "1000".
        // Let's just prompt user.
        if (confirm(`Package '${pkgName}' not found in database (likely renamed or old data).\n\nDo you want to create missions MANUALLY for this order?`)) {
            showSection('missions'); // Correct ID is 'missions' (Create Mission page)
            const mLink = document.getElementById('mLink');
            if (mLink) mLink.value = link;

            // Try to deduce category/platform for manual limit
            const lowerName = pkgName.toLowerCase();
            const platformSelect = document.getElementById('mPlatform');
            if (platformSelect) {
                if (lowerName.includes('shopee')) platformSelect.value = 'Shopee'; // Assuming option exists? Or mapped to Review
                else if (lowerName.includes('tiktok')) platformSelect.value = 'TikTok'; // Wait, mPlatform values are actions?
                // mCategory has platforms. mPlatform has actions.
                // Let's check mCategory
            }
            const catSelect = document.getElementById('mCategory');
            if (catSelect) {
                if (lowerName.includes('tiktok')) catSelect.value = 'TikTok';
                else if (lowerName.includes('shopee')) catSelect.value = 'Shopee';
                else if (lowerName.includes('youtube')) catSelect.value = 'YouTube';
                else if (lowerName.includes('instagram')) catSelect.value = 'Instagram';
            }

            alert('Please manually configure the missions based on the order details.');
        }
        return;
    }

    // 2. Auto-Split Logic (Headless)
    let features = [];
    try {
        features = typeof pkg.features === 'string' ? JSON.parse(pkg.features) : pkg.features;
    } catch (e) {
        console.error('JSON Parse Error', e);
        features = [];
    }

    // Category Mapping (Fix for Enum 'SOSMED' issue)
    const mapCategory = (raw) => {
        if (!raw) return 'Other';
        const upper = raw.toUpperCase().trim();
        if (upper === 'SOSMED' || upper === 'TIKTOK' || upper === 'INSTAGRAM') return 'Sosmed';
        if (upper === 'UMKM' || upper === 'GOOGLE MAPS') return 'Umkm';
        if (upper === 'E-COMMERCE' || upper === 'SHOPEE') return 'E-Commerce'; // Try E-Commerce with hyphen first?
        // Fallback: Title Case (e.g. "Review" -> "Review")
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    };

    // Show Progress
    if (typeof showToast === 'function') showToast('⏳ Verifying Order...', 'info');

    // --- SMART FEATURE CLASSIFICATION ---
    // Separate actionable missions (have qty + @price) from bundled requirements (labels only)
    // Pattern: "500 Reviews @500" = ACTIONABLE, "Rating Bintang 5" = BUNDLED REQUIREMENT
    const actionableFeatures = [];
    const bundledRequirements = [];

    features.forEach(f => {
        const label = typeof f === 'string' ? f : (f.label || JSON.stringify(f));
        const hasQtyAndPrice = /^\d+\s+.+@\s*\d+/.test(label); // e.g. "500 Reviews @500"
        const hasQtyOnly = /^\d+\s+.+/.test(label);            // e.g. "500 Reviews" (no price)
        const isBonus = /^bonus\s/i.test(label);                // e.g. "Bonus Share @200"

        if (hasQtyAndPrice && !isBonus) {
            actionableFeatures.push(label);
        } else if (isBonus && hasQtyAndPrice) {
            // Bonus with qty & price → treat as small actionable mission
            // Extract qty from "Bonus Share @200" → qty is missing, use small default
            const bonusMatch = label.match(/bonus\s+(.+?)@\s*(\d+)/i);
            if (bonusMatch) actionableFeatures.push(label);
            else bundledRequirements.push(label);
        } else {
            // Labels without qty+price: "Rating Bintang 5", "High Safety", "Shield Guarantee", etc.
            bundledRequirements.push(label);
        }
    });

    // Build bundled requirements string for mission description
    const bundledText = bundledRequirements.length > 0
        ? bundledRequirements.map(r => `✅ ${r}`).join('\n')
        : '';

    console.log(`📦 Feature Split: ${actionableFeatures.length} missions, ${bundledRequirements.length} bundled requirements`);
    if (bundledRequirements.length > 0) console.log(`  📎 Bundled: ${bundledRequirements.join(', ')}`);

    // Detect Platform once (same for all features in a package)
    let targetPlatform = 'Other';
    const rawSearch = ((pkg.sub_category || '') + ' ' + (pkg.category || '') + ' ' + (pkg.name || '')).toUpperCase();

    if (rawSearch.includes('TIKTOK') && !rawSearch.includes('SHOP')) targetPlatform = 'TikTok';
    else if (rawSearch.includes('TIKTOK SHOP')) targetPlatform = 'TikTok Shop';
    else if (rawSearch.includes('YOUTUBE') || rawSearch.includes('YT')) targetPlatform = 'YouTube';
    else if (rawSearch.includes('INSTAGRAM') || rawSearch.includes('IG')) targetPlatform = 'Instagram';
    else if (rawSearch.includes('FACEBOOK') || rawSearch.includes('FB')) targetPlatform = 'Facebook';
    else if (rawSearch.includes('SHOPEE')) targetPlatform = 'Shopee';
    else if (rawSearch.includes('GOOGLE') || rawSearch.includes('MAPS') || rawSearch.includes('GMAPS')) targetPlatform = 'Google Maps';

    const missionsToCreate = actionableFeatures.map(label => {
        // Parse "500 Reviews @500" or "Bonus Share @200"
        const match = label.match(/(\d+)\s+(.+?)(?:\s*@\s*(\d+))?$/);
        let qty = match ? parseInt(match[1]) : 1;
        let type = match ? match[2].trim() : label;
        let reward = match && match[3] ? parseInt(match[3]) : 50;

        // Handle Bonus prefix: "Bonus Share @200" → qty might be 0
        if (/^bonus\s/i.test(label)) {
            const bonusMatch = label.match(/bonus\s+(.+?)@\s*(\d+)/i);
            if (bonusMatch) {
                type = bonusMatch[1].trim();
                reward = parseInt(bonusMatch[2]);
                qty = Math.max(qty, 1); // At least 1 for bonus
            }
        }

        // Detect Action Type
        let targetAction = 'Like';
        const typeLower = type.toLowerCase();

        if (typeLower.includes('follow') || typeLower.includes('ikut')) targetAction = 'Follow';
        else if (typeLower.includes('like') || typeLower.includes('suka')) targetAction = 'Like';
        else if (typeLower.includes('comment') || typeLower.includes('komen')) targetAction = 'Comment';
        else if (typeLower.includes('review') || typeLower.includes('ulas') || typeLower.includes('testimoni')) targetAction = 'Review';
        else if (typeLower.includes('sub')) targetAction = 'Subscribe';
        else if (typeLower.includes('share') || typeLower.includes('bagi')) targetAction = 'Share';
        else if (typeLower.includes('view') || typeLower.includes('nonton') || typeLower.includes('tayang')) targetAction = 'View';
        else if (typeLower.includes('live')) targetAction = 'Live';
        else if (typeLower.includes('rating')) targetAction = 'Review';

        // ⚠️ AWAS: PENTING UNTUK INSERT MISSION
        // Tabel missions di database TIDAK MEMILIKI kolom `description`
        // Jika Anda mencoba mengirim field "description: ...", proses Verify akan GAGAL (Schema Cache Error).
        // Sebagai gantinya, jika ada tulisan tambahan (bundled requirements), harus dilampirkan ke dalam `title`.
        let missionTitle = `${targetPlatform} - ${type} (${clientName})`;

        return {
            title: missionTitle,
            platform_type: targetAction,
            platform: targetPlatform,
            category: pkg.category || 'SOSMED',
            quota: qty,
            reward: reward,
            link: link,
            status: 'Active',
            order_id: orderId,
            package_id: pkg.id
        };
    });

    // 3. Confirmation Dialog (Atomic Action)
    const msg = `Verify this order for '${clientName}'?\n\n` +
        `📦 Package: ${pkg.name}\n` +
        `🤖 Auto-Split: Will create ${missionsToCreate.length} mission(s) immediately.\n` +
        `\nClick OK to EXECUTE (Insert DB & Verify Order).`;

    if (!confirm(msg)) return;

    // 4. Execute Insertion
    try {
        const { data: createdMissions, error: insertErr } = await insertMissionsApi(missionsToCreate);
        if (insertErr) throw insertErr;

        // --- AI COMMENT AUTO-GENERATION VIA EDGE FUNCTION ---
        // ⚠️ AWAS: JANGAN UBAH LOGIKA PEMANGGILAN EDGE FUNCTION INI
        // Ini adalah lapis pertama (Primary Layer) pembuatan komentar AI.
        // Setelah Order diverifikasi dan Misi dibuat, sistem akan *langsung* menembak Edge Function `generate-comment`.
        // Hasil dari Edge Function ini akan disimpan ke tabel `mission_tasks` sehingga saat pasukan ambil misi,
        // pasokan komentar sudah siap dipakai. Jika gagal di langkah ini, Tenang Saja! Bot memiliki 
        // fallback mechanism (lapis kedua) untuk auto-generate ketika `mission_tasks` kosong.
        // Filter missions that need AI comments (Comment/Review types)
        if (createdMissions && createdMissions.length > 0) {
            const aiMissions = createdMissions.filter(m =>
                ['Comment', 'Review', 'Ulasan', 'Komentar'].includes(m.platform_type)
            );

            if (aiMissions.length > 0) {
                console.log(`🤖 Generating AI comments for ${aiMissions.length} mission(s) via Edge Function...`);
                if (typeof showToast === 'function') showToast(`🤖 AI sedang generate komentar untuk ${aiMissions.length} misi...`, 'info');

                // Process each mission (sequential to avoid rate limits)
                for (const m of aiMissions) {
                    try {
                        // Extract context from link (after "|" separator)
                        let aiContext = '';
                        const rawLink = m.link || '';
                        if (rawLink.includes('|')) {
                            aiContext = rawLink.split('|').slice(1).join('|').trim()
                                .replace(/^Note:\s*/i, '')
                                .replace(/^\[Context AI\]\s*/i, '');
                        }

                        // Fallback context from package name + description
                        if (!aiContext) {
                            aiContext = `${pkg.name || ''} - ${pkg.sub_category || ''} - ${m.title || ''}`;
                        }

                        // Determine tone based on platform
                        let tone = 'Sopan';
                        if (m.platform === 'TikTok' || m.platform === 'Instagram') tone = 'Gaul';
                        else if (m.platform === 'Google Maps' || m.platform === 'Shopee') tone = 'Sopan';
                        else if (m.platform === 'YouTube') tone = 'Santai';
                        else if (m.platform === 'Facebook') tone = 'Formal';

                        const quantity = Math.min(m.quota || 10, 500);

                        console.log(`  📝 ${m.platform} | Context: "${aiContext.substring(0, 50)}..." | Qty: ${quantity} | Tone: ${tone}`);

                        // Call Edge Function directly (generates + saves to mission_tasks)
                        const result = await invokeAiFunction({
                            mission_id: m.id,
                            context: aiContext,
                            tone: tone,
                            quantity: quantity,
                            platform: m.platform || 'Other'
                        });

                        console.log(`  ✅ ${m.platform}: ${result?.count || 0} komentar berhasil digenerate`);
                    } catch (aiErr) {
                        console.error(`  ❌ AI Error for ${m.platform}:`, aiErr.message);
                        // Don't block verification if AI fails
                    }
                }

                if (typeof showToast === 'function') showToast(`✅ AI komentar berhasil digenerate!`, 'success');
            }
        }
        // --------------------------------

        const { error: updateErr } = await updateOrderStatusApi(orderId, 'verified');
        if (updateErr) throw updateErr;

        if (typeof showToast === 'function') showToast(`✅ ${missionsToCreate.length} Misi berhasil dibuat!`, 'success');

        // Refresh UI
        fetchOrders();
        fetchActiveMissions();

    } catch (err) {
        alert('❌ Error processing order: ' + err.message);
    }
};

// ... resetOrderStatus ...

// Admin Access Control
async function checkAdminAccess() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = 'login.html'; return false; }
        // Try bootstrap (first user becomes super_admin)
        await supabase.rpc('bootstrap_admin');
        // Check admin role
        const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', session.user.id).single();
        if (!role) {
            alert('Anda tidak memiliki akses admin. Hubungi super admin.');
            await supabase.auth.signOut();
            window.location.href = 'login.html';
            return false;
        }
        return true;
    } catch (e) {
        console.warn('Admin check skipped (table may not exist yet):', e.message);
        return true; // Graceful fallback
    }
}

// Initial Fetch with Admin Check
if (window.location.href.includes('admin')) {
    checkAdminAccess().then(isAdmin => {
        if (!isAdmin) return;
        setTimeout(() => {
            if (window.fetchActiveMissions) window.fetchActiveMissions();
            if (window.fetchOrders) window.fetchOrders();
            if (window.fetchPackages) window.fetchPackages();
        }, 500);
    });
}

window.packagesData = {};

// --- Feature Builder System (Updated for Pricing Strategy) ---
window.addFeatureRow = (qty = '', action = '', reward = '', autoSuggest = true) => {
    // Ensure datalist exists
    if (!document.getElementById('action-suggestions')) {
        const dl = document.createElement('datalist');
        dl.id = 'action-suggestions';
        ['Followers', 'Likes', 'Comments', 'Views', 'Shares', 'Subscribers', 'Reviews', 'Rating', 'Jam Tayang', 'Garansi', 'Real Human', 'Instant'].forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            dl.appendChild(opt);
        });
        document.body.appendChild(dl);
    }

    const container = document.getElementById('features-builder');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center animate-fade-in feature-row';

    // Quantity Input
    const qtyInput = document.createElement('input');
    qtyInput.type = 'text';
    qtyInput.className = 'w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center font-bold focus:ring-1 focus:ring-blue-500 outline-none feature-qty';
    qtyInput.placeholder = 'Qty';
    qtyInput.value = qty;

    // Action Dropdown
    const actionInput = document.createElement('input');
    actionInput.type = 'text';
    actionInput.className = 'flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-blue-500 outline-none feature-action';
    actionInput.placeholder = 'Action (e.g. Followers)';
    actionInput.setAttribute('list', 'action-suggestions');
    actionInput.value = action;

    // Reward Input (New)
    const rewardInput = document.createElement('input');
    rewardInput.type = 'number';
    rewardInput.className = 'w-24 bg-green-50/50 border border-green-200 rounded-lg px-2 py-2 text-sm text-center font-bold text-green-700 focus:ring-1 focus:ring-green-500 outline-none feature-reward';
    rewardInput.placeholder = 'Rp';
    rewardInput.title = 'Reward per Unit (Rp)';

    // Pre-fill Reward Logic (Updated 2026 Strategy)
    const suggestReward = (act) => {
        if (/review|ulasan|gmaps|google/i.test(act)) return 3000;
        if (/comment|komen|ulas/i.test(act)) return 750; // New default
        if (/follow|ikut|sub/i.test(act)) return 400;
        if (/share|bagi/i.test(act)) return 250;
        if (/like|suka/i.test(act)) return 150;
        if (/view|tonton/i.test(act)) return 50;
        return '';
    };

    if (reward) {
        rewardInput.value = reward;
    } else if (action && !reward && autoSuggest) {
        const sugg = suggestReward(action);
        if (sugg) rewardInput.value = sugg;
    }

    // Delete Button
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-red-400 hover:text-red-600 p-2 rounded';
    delBtn.innerHTML = '✕';
    delBtn.onclick = () => { div.remove(); window.calculateProfit(); };

    // Listeners
    qtyInput.addEventListener('input', window.calculateProfit);
    rewardInput.addEventListener('input', window.calculateProfit);
    actionInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!rewardInput.value.trim()) {
            const sugg = suggestReward(val);
            if (sugg) rewardInput.value = sugg;
        }
        window.calculateProfit();
    });

    div.appendChild(qtyInput);
    div.appendChild(actionInput);
    div.appendChild(rewardInput);
    div.appendChild(delBtn);
    container.appendChild(div);

    if (window.calculateProfit) window.calculateProfit();
};

// --- Profit Calculation System (Margin 30-40%) ---
window.calculateProfit = () => {
    const priceInput = document.getElementById('editPkgPrice');
    const panel = document.getElementById('profit-analysis');

    if (!priceInput || !panel) return;

    const price = parseInt(priceInput.value) || 0;
    let totalCost = 0;

    const featureRows = document.querySelectorAll('#features-builder .feature-row');
    featureRows.forEach(row => {
        const qtyEl = row.querySelector('.feature-qty');
        const actEl = row.querySelector('.feature-action');
        const rwdEl = row.querySelector('.feature-reward');

        if (!qtyEl || !actEl) return;

        let qty = qtyEl.value.trim();
        const action = actEl.value.trim().toLowerCase();

        let multiplier = 1;
        if (qty.toLowerCase().includes('k')) { multiplier = 1000; qty = qty.replace(/k/i, ''); }
        else if (qty.toLowerCase().includes('m')) { multiplier = 1000000; qty = qty.replace(/m/i, ''); }
        qty = qty.replace(/,/g, '.');
        const quantity = Math.floor((parseFloat(qty) || 0) * multiplier);

        let rewardPerUnit = 0;
        if (rwdEl && rwdEl.value) {
            rewardPerUnit = parseInt(rwdEl.value);
        } else {
            // Fallback defaults if input empty
            if (/review|ulasan/i.test(action)) rewardPerUnit = 3000;
            else if (/comment|komen/i.test(action)) rewardPerUnit = 750;
            else if (/follow|ikut/i.test(action)) rewardPerUnit = 400;
            else if (/like|suka/i.test(action)) rewardPerUnit = 150;
            else if (quantity > 0) rewardPerUnit = 100;
        }

        if (quantity > 0) {
            totalCost += (quantity * rewardPerUnit);
        }
    });

    const margin = price - totalCost;
    const marginPercent = price > 0 ? ((margin / price) * 100).toFixed(1) : 0;

    document.getElementById('analysis-price').innerText = 'Rp ' + price.toLocaleString('id-ID');
    document.getElementById('analysis-cost').innerText = 'Rp ' + totalCost.toLocaleString('id-ID');

    const marginEl = document.getElementById('analysis-margin');
    const badgeEl = document.getElementById('analysis-badge');

    marginEl.innerText = `Rp ${margin.toLocaleString('id-ID')} (${marginPercent}%)`;

    panel.classList.remove('hidden', 'bg-red-50', 'border-red-200', 'bg-amber-50', 'border-amber-200', 'bg-green-50', 'border-green-200', 'bg-gray-50', 'border-gray-200');
    marginEl.classList.remove('text-red-600', 'text-amber-600', 'text-green-600', 'text-gray-800');
    badgeEl.className = 'px-2 py-1 rounded text-[10px] font-bold uppercase';
    badgeEl.classList.remove('animate-pulse');

    if (margin < 0) {
        panel.classList.add('bg-red-50', 'border-red-200');
        marginEl.classList.add('text-red-600');
        badgeEl.classList.add('bg-red-200', 'text-red-700', 'animate-pulse');
        badgeEl.innerText = '⚠️ LOSS';
    } else if (marginPercent < 30) {
        panel.classList.add('bg-amber-50', 'border-amber-200');
        marginEl.classList.add('text-amber-600');
        badgeEl.classList.add('bg-amber-200', 'text-amber-700');
        badgeEl.innerText = '⚠️ LOW MARGIN (<30%)';
    } else if (margin > 0) {
        panel.classList.add('bg-green-50', 'border-green-200');
        marginEl.classList.add('text-green-600');
        badgeEl.classList.add('bg-green-200', 'text-green-700');
        badgeEl.innerText = '✅ HEALTHY PROFIT';
    } else {
        panel.classList.add('bg-gray-50', 'border-gray-200');
        marginEl.classList.add('text-gray-800');
        badgeEl.classList.add('bg-gray-200', 'text-gray-600');
        badgeEl.innerText = 'Pending';
    }
};

// ... (Datalist init - no change needed) ...

// --- Main Logic ---

// --- User & Client Management Fetching ---
window.fetchProfiles = async () => {
    console.log('Fetching profiles/workers...');
    try {
        const { data: profiles, error } = await fetchAllProfilesApi();
        if (error) {
            console.error('Fetch Profiles Error:', error);
            return;
        }
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = profiles.map(p => {
            const date = new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

            // Extract DANA if formatted
            let danaD = '-';
            if (p.phone_number) {
                danaD = p.phone_number.includes('|') ? p.phone_number.split('|')[1].trim() : p.phone_number;
            }

            // Hitung berapa pasukan yang berhasil dia undang
            const referralCount = profiles.filter(x => x.referred_by === p.id).length;

            return `
            <tr class="hover:bg-gray-50 transition border-b border-gray-100">
                <td class="p-4">
                    <div class="font-medium text-gray-800">${p.full_name || p.username || 'Unknown'}</div>
                    ${p.username ? `<div class="text-[10px] text-gray-400">@${p.username}</div>` : ''}
                </td>
                <td class="p-4">
                    <div class="text-xs font-mono text-gray-500">${p.id}</div>
                    ${referralCount > 0 ? `<div class="mt-1 text-[10px] bg-green-50 text-green-600 font-bold px-2 py-0.5 rounded-full inline-block">🤝 ${referralCount} Referral</div>` : ''}
                </td>
                <td class="p-4">
                    <span class="font-bold text-green-600">Rp ${(p.balance || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="p-4">
                    ${danaD !== '-' ? `<span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold border border-blue-100">${danaD}</span>` : '<span class="text-gray-400 italic text-xs">Belum diset</span>'}
                </td>
                <td class="p-4">
                    <div class="text-xs text-gray-500">${date}</div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Unexpected error fetching profiles:', err);
    }
};

window.fetchClients = async () => {
    // Clients are aggregated from Orders history
    console.log('Fetching clients (from orders)...');
    try {
        const { data: orders, error } = await fetchOrdersApi();
        if (error) return;

        // Group explicitly by Client WhatsApp or Name
        const clients = {};
        orders.forEach(o => {
            const key = o.client_whatsapp || o.client_name || 'Anonymous';
            if (!clients[key]) {
                clients[key] = {
                    name: o.client_name || 'Guest',
                    wa: o.client_whatsapp || '-',
                    service: [],
                    links: {
                        gmaps: [], tiktok: [], facebook: [], ig: [], yt: [], shopee: [], tt_shop: []
                    }
                };
            }
            if (!clients[key].service.includes(o.package_name)) clients[key].service.push(o.package_name);

            // Cerdas memisahkan kolom sosial media bersadarkan nama paket/tautan
            if (o.social_link) {
                const pkgName = o.package_name ? o.package_name.toLowerCase() : '';
                let platform = 'other';

                if (pkgName.includes('maps')) platform = 'gmaps';
                else if (pkgName.includes('tiktok shop') || pkgName.includes('tt shop')) platform = 'tt_shop';
                else if (pkgName.includes('tiktok')) platform = 'tiktok';
                else if (pkgName.includes('facebook') || pkgName.includes('fb')) platform = 'facebook';
                else if (pkgName.includes('instagram') || pkgName.includes('ig')) platform = 'ig';
                else if (pkgName.includes('youtube') || pkgName.includes('yt')) platform = 'yt';
                else if (pkgName.includes('shopee')) platform = 'shopee';

                // Jika nama paket kurang meyakinkan, coba deteksi dari URL secara paksa
                if (platform === 'other') {
                    const url = o.social_link.toLowerCase();
                    if (url.includes('goo.gl') || url.includes('maps')) platform = 'gmaps';
                    else if (url.includes('tiktok.com')) platform = 'tiktok';
                    else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'facebook';
                    else if (url.includes('instagram.com')) platform = 'ig';
                    else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'yt';
                    else if (url.includes('shopee.co')) platform = 'shopee';
                }

                // Masukkan ke array pemetaan
                if (platform !== 'other' && !clients[key].links[platform].includes(o.social_link)) {
                    clients[key].links[platform].push(o.social_link);
                } else if (platform === 'other') {
                    // Buang ke gmaps sebagai default darurat jika tetap tidak terdeteksi (sebab mayoritas pesanan Gmaps)
                    if (!clients[key].links['gmaps'].includes(o.social_link)) {
                        clients[key].links['gmaps'].push(o.social_link);
                    }
                }
            }
        });

        const tbody = document.getElementById('clientsTableBody');
        if (!tbody) return;

        // Fungsi mencetak badge [Link] bertumpuk kebawah
        // Fungsi mencetak badge [Link] bertumpuk kebawah dengan tombol Delete
        const renderLinks = (arr, wa) => arr.length > 0
            ? arr.map((link, idx) => `
                <div class="relative group inline-block w-full">
                    <a href="${link}" target="_blank" class="hover:underline text-blue-600 block mb-1 truncate w-14 mx-auto border-b border-blue-200 pb-0.5" title="${link}">L-${idx + 1}</a>
                    <button onclick="window.deleteClientLink('${wa}', '${link}')" class="absolute -top-1 -right-2 hidden group-hover:flex items-center justify-center bg-red-500 text-white rounded-full w-4 h-4 hover:bg-red-600 shadow-sm" title="Hapus Link secara permanen">
                       <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            `).join('')
            : '<span class="text-gray-300">-</span>';

        tbody.innerHTML = Object.values(clients).map(c => `
        <tr class="hover:bg-gray-50 transition border-b border-gray-100">
            <td class="p-4">
                <div class="font-bold text-gray-800">${c.name}</div>
            </td>
            <td class="p-4">
                <div class="text-sm text-gray-600 font-mono font-bold">${c.wa}</div>
            </td>
            <td class="p-4">
                <div class="text-xs text-gray-500">${c.service.join('<br>')}</div>
            </td>
            <td class="p-2 border-l text-[10px] text-center bg-blue-50/10 align-top">${renderLinks(c.links.gmaps, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-gray-50/10 align-top">${renderLinks(c.links.tiktok, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-blue-50/10 align-top">${renderLinks(c.links.facebook, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-gray-50/10 align-top">${renderLinks(c.links.ig, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-blue-50/10 align-top">${renderLinks(c.links.yt, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-gray-50/10 align-top">${renderLinks(c.links.shopee, c.wa)}</td>
            <td class="p-2 border-l text-[10px] text-center bg-blue-50/10 align-top">${renderLinks(c.links.tt_shop, c.wa)}</td>
        </tr>`).join('');
    } catch (err) {
        console.error('Error fetching clients:', err);
    }
};

window.deleteClientLink = async (clientWa, link) => {
    if (!confirm('🗑️ Hapus link sosial/target ini secara permanen dari riwayat pemesanan klien di database?')) return;

    try {
        const { error } = await deleteClientLinkApi(clientWa, link);
        if (error) {
            alert('Gagal menghapus link: ' + error.message);
        } else {
            console.log("Berhasil menghapus link " + link);
            window.fetchClients(); // Refresh tables
        }
    } catch (err) {
        console.error(err);
    }
};

async function fetchOrders() {
    console.log('Fetching orders...');
    try {
        const { data, error } = await fetchOrdersApi();
        window.ordersCache = data || []; // Cache for global access

        if (error) {
            console.error('Fetch Error:', error);
            alert('Supabase Error: ' + error.message);
            return;
        }

        const ordersTable = document.getElementById('ordersTable');
        if (!ordersTable) {
            console.error('Error: ordersTable element not found!');
            return;
        }

        if (!data || data.length === 0) {
            ordersTable.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No orders found.</td></tr>';
            return;
        }

        ordersTable.innerHTML = renderOrdersHTML(data);
    } catch (err) {
        console.error('Unexpected Error:', err);
        alert('Unexpected Error: ' + err.message);
    }
}

async function fetchSubmissions() {
    const { data: submissions, error } = await fetchSubmissionsApi();
    if (error) return console.error(error);

    const submissionTable = document.getElementById('submissionTable');
    if (!submissionTable) return;

    submissionTable.innerHTML = submissions.map(sub => {
        const missionTitle = sub.missions?.title || 'Unknown Mission';

        // Cerdas dalam mengenali identitas profil user Telegram
        const fullName = sub.profiles?.full_name || sub.profiles?.username || 'Unknown User';

        // Membaca dompet DANA pasukan
        let danaNumber = '-';
        if (sub.profiles?.phone_number) {
            danaNumber = sub.profiles.phone_number.includes('|')
                ? sub.profiles.phone_number.split('|')[1].trim()
                : sub.profiles.phone_number;
        }
        const danaDisplay = danaNumber !== '-' ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full mt-1 inline-block border border-blue-100 font-bold">DANA: ${danaNumber}</span>` : `<span class="text-[10px] text-red-500 mt-1 inline-block italic">Dompet belum diset</span>`;

        return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
            <td class="p-4">
                <div class="font-bold text-gray-800">${missionTitle}</div>
                <div class="text-xs text-gray-400">Mission ID: ${sub.mission_id.substring(0, 8)}</div>
            </td>
            <td class="p-4">
                <div class="font-medium text-gray-700">${fullName}</div>
                <div class="text-[10px] text-gray-400">ID: ${sub.user_id}</div>
                ${danaDisplay}
            </td>
            <td class="p-4">
                <a href="${sub.proof_url}" target="_blank" class="text-blue-600 underline text-xs font-bold flex items-center gap-1">
                    📄 View Proof
                </a>
            </td>
            <td class="p-4 text-right">
                ${sub.status === 'Pending' ? `
                <button onclick="window.approve('${sub.id}', '${sub.user_id}', ${sub.missions?.reward || 0})" 
                    class="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-green-200 mr-2 transition">
                    Approve (Rp ${sub.missions?.reward})
                </button>
                <button onclick="window.reject('${sub.id}')" 
                    class="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-200 transition">
                    Reject
                </button>
                ` : `
                <span class="text-xs font-bold ${sub.status === 'Approved' ? 'text-green-600' : 'text-red-600'}">
                    ${sub.status}
                </span>
                `}
            </td>
        </tr>
        `;
    }).join('');
}

async function fetchSettings() {
    const { data, error } = await fetchSettingsApi();
    if (error) {
        console.error('Error fetching settings:', error);
        return;
    }

    // Populate all setting fields from database
    (data || []).forEach(setting => {
        const el = document.getElementById(`setting-${setting.key}`);
        if (!el) return;

        if (el.type === 'checkbox') {
            el.checked = setting.value === 'true' || setting.value === '1';
        } else if (el.tagName === 'SELECT') {
            el.value = setting.value;
        } else if (el.tagName === 'TEXTAREA') {
            el.value = setting.value || '';
        } else {
            el.value = setting.value || '';
        }

        // Special: QRIS preview
        if (setting.key === 'qris_url' && setting.value) {
            const preview = document.getElementById('preview-qris');
            if (preview) preview.src = setting.value;
        }
    });
}

// --- Save All Settings ---
window.saveAllSettings = async () => {
    const settingKeys = [
        'business_name', 'admin_whatsapp', 'website_url', 'support_email', 'business_desc', 'community_group_link',
        'qris_url', 'payment_name', 'payment_instructions',
        'admin_chat_id', 'min_withdrawal', 'max_daily_missions', 'welcome_message',
        'ai_default_tone', 'ai_default_quantity', 'ai_retry_interval', 'comment_expire_days',
        'platform_instagram', 'platform_tiktok', 'platform_youtube', 'platform_facebook', 'platform_shopee', 'platform_gmaps',
        'feature_ai_comments', 'feature_ai_verification', 'maintenance_mode', 'feature_order_notif',
        'referral_bonus_amount', 'referral_template',
        'cache_ttl_minutes', 'auto_delete_days',
        'channel_broadcast_target', 'channel_broadcast_interval_hours'
    ];

    const statusEl = document.getElementById('settingsSaveStatus');
    const saveBtn = document.querySelector('#section-settings button[onclick*="saveAllSettings"]');
    const originalBtnText = saveBtn ? saveBtn.innerHTML : '';

    // Loading state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '⏳ Menyimpan...';
        saveBtn.style.opacity = '0.7';
    }

    let saved = 0;
    let errors = 0;

    for (const key of settingKeys) {
        const el = document.getElementById(`setting-${key}`);
        if (!el) continue;

        let value;
        if (el.type === 'checkbox') {
            value = el.checked ? 'true' : 'false';
        } else {
            value = el.value || '';
        }

        // updateSettingApi already uses upsert — handles both insert & update
        const { error } = await updateSettingApi(key, value);
        if (error) {
            console.error(`Failed to save ${key}:`, error);
            errors++;
        } else {
            saved++;
        }
    }

    // Restore button
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
        saveBtn.style.opacity = '1';
    }

    // Status indicator
    if (statusEl) {
        statusEl.textContent = errors > 0
            ? `⚠ ${saved} saved, ${errors} failed`
            : `✓ ${saved} settings berhasil disimpan!`;
        statusEl.className = errors > 0
            ? 'text-xs text-amber-400'
            : 'text-xs text-emerald-400';
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 4000);
    }

    if (typeof showToast === 'function') {
        showToast(errors > 0
            ? `⚠️ ${saved} tersimpan, ${errors} gagal`
            : `✅ ${saved} settings berhasil disimpan!`,
            errors > 0 ? 'error' : 'success'
        );
    }

    // Re-fetch to sync UI with saved data
    await fetchSettings();
};

// --- Export All Settings as JSON ---
window.exportAllSettings = async () => {
    const { data, error } = await fetchSettingsApi();
    if (error) return alert('Gagal mengambil settings');

    const settingsObj = {};
    (data || []).forEach(s => { settingsObj[s.key] = s.value; });

    const json = JSON.stringify(settingsObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `misicuan-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('📤 Settings berhasil diexport!', 'success');
};

// --- Clear Old Completed Missions ---
window.clearOldMissions = async () => {
    const autoDeleteEl = document.getElementById('setting-auto_delete_days');
    const days = parseInt(autoDeleteEl?.value) || 90;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    // Count first
    const { count, error: countError } = await supabase
        .from('missions')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', cutoffISO)
        .in('status', ['Completed', 'completed', 'Archived', 'archived']);

    if (countError) {
        if (typeof showToast === 'function') showToast('❌ Gagal menghitung misi', 'error');
        return;
    }

    if (!count || count === 0) {
        if (typeof showToast === 'function') showToast('ℹ️ Tidak ada misi lama yang perlu dihapus', 'info');
        return;
    }

    if (!confirm(`Ditemukan ${count} misi selesai/archived yang lebih dari ${days} hari.\nYakin ingin menghapus? Aksi ini tidak bisa dibatalkan!`)) return;

    const { error } = await supabase
        .from('missions')
        .delete()
        .lt('created_at', cutoffISO)
        .in('status', ['Completed', 'completed', 'Archived', 'archived']);

    if (error) {
        console.error('Delete old missions error:', error);
        if (typeof showToast === 'function') showToast('❌ Gagal menghapus misi lama: ' + error.message, 'error');
    } else {
        if (typeof showToast === 'function') showToast(`✅ ${count} misi lama berhasil dihapus!`, 'success');
    }
};

// --- Clear Expired AI Comments ---
window.clearExpiredComments = async () => {
    const expireDaysEl = document.getElementById('setting-comment_expire_days');
    const days = parseInt(expireDaysEl?.value) || 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    // Count first
    const { count, error: countError } = await supabase
        .from('mission_tasks')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', cutoffISO);

    if (countError) {
        if (typeof showToast === 'function') showToast('❌ Gagal menghitung komentar', 'error');
        return;
    }

    if (!count || count === 0) {
        if (typeof showToast === 'function') showToast('ℹ️ Tidak ada komentar expired yang perlu dihapus', 'info');
        return;
    }

    if (!confirm(`Ditemukan ${count} komentar yang lebih dari ${days} hari.\nYakin ingin menghapus? Aksi ini tidak bisa dibatalkan!`)) return;

    const { error } = await supabase
        .from('mission_tasks')
        .delete()
        .lt('created_at', cutoffISO);

    if (error) {
        console.error('Delete expired comments error:', error);
        if (typeof showToast === 'function') showToast('❌ Gagal menghapus komentar expired: ' + error.message, 'error');
    } else {
        if (typeof showToast === 'function') showToast(`✅ ${count} komentar >${days} hari berhasil dihapus!`, 'success');
    }
};

window.renderPackageSummary = (featuresArray) => {
    const mPackageSummary = document.getElementById('mPackageSummary');
    if (!mPackageSummary) return;

    if (!featuresArray || featuresArray.length === 0) {
        mPackageSummary.classList.add('hidden');
        mPackageSummary.innerHTML = '';
        return;
    }

    const listHtml = featuresArray.map(f => {
        const match = f.match(/^([\d.,]+[kmKM]?)\s+(.+)/);
        if (match) {
            return `<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span><span class="font-bold text-blue-600">${match[1]}</span> <span class="text-gray-600">${match[2]}</span></li>`;
        }
        return `<li class="flex items-center gap-2"><span class="text-gray-400">•</span> <span class="text-gray-600">${f}</span></li>`;
    }).join('');

    mPackageSummary.innerHTML = `
        <div class="bg-blue-50/50 rounded-xl p-4 border border-blue-100 mb-6">
            <h4 class="text-xs font-bold text-blue-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                📦 Paket Ini Akan Membuat Misi:
            </h4>
            <ul class="text-xs space-y-1.5 pl-1">
                ${listHtml}
            </ul>
        </div>
    `;
    mPackageSummary.classList.remove('hidden');
}

async function fetchPackages() {
    try {
        const { data, error } = await fetchPackagesApi();
        if (error) {
            console.error('Fetch packages error:', error);
            if (typeof showToast === 'function') showToast('Gagal memuat paket. Silakan refresh.', 'error');
            return;
        }

        data.forEach(pkg => {
            window.packagesData[pkg.id] = pkg;
        });

        populatePackageSelect();

        const packagesTable = document.getElementById('packagesTable');
        if (!packagesTable) return;

        if (data.length === 0) {
            packagesTable.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No packages found.</td></tr>';
            return;
        }

        // Advanced Sorting: Category -> SubCategory -> Price
        data.sort((a, b) => {
            // Priority: SOSMED first? No, Alphabetical or Custom.
            // Let's do Alphabetical Category
            if (a.category !== b.category) return a.category.localeCompare(b.category);

            // Then SubCategory
            const subA = a.sub_category || '';
            const subB = b.sub_category || '';
            if (subA !== subB) return subA.localeCompare(subB);

            // Then Price (Low to High)
            return a.price - b.price;
        });

        packagesTable.innerHTML = renderPackagesHTML(data);
    } catch (err) {
        console.error('Unexpected error in fetchPackages:', err);
        if (typeof showToast === 'function') showToast('Gagal memuat paket.', 'error');
    }
}

// --- Window Actions ---
window.rejectOrder = async (orderId) => {
    if (!confirm('Tolak pesanan ini?\nPelanggan akan melihat status Rejected.')) return;
    const { error } = await updateOrderStatusApi(orderId, 'rejected');
    if (error) alert('Error: ' + error.message);
    else fetchOrders();
};

window.approve = async (submissionId, userId, rewardAmount) => {
    if (!confirm('Setujui bukti ini? Saldo user akan bertambah.')) return;

    const { error: subError } = await updateSubmissionStatusApi(submissionId, 'Approved');
    if (subError) {
        alert('Gagal menyetujui submisi.');
        return;
    }

    // MUST use secure RPC function due to database Triggers blocking direct balance manipulation
    const { error: balError } = await supabase.rpc('increment_balance', {
        user_id: Number(userId),
        amount: Number(rewardAmount)
    });

    if (balError) {
        console.error('Balance RPC error:', balError);
        alert('PERINGATAN: Saldo gagal ditambahkan karena konflik sistem (Error Database PGRST203). Hubungi developer!');
    }

    const { data: sub } = await getSubmissionMissionIdApi(submissionId);
    if (sub) {
        const { data: mission } = await getMissionQuotaApi(sub.mission_id);
        if (mission && mission.quota > 0) {
            const newQuota = mission.quota - 1;
            const updateData = { quota: newQuota };
            if (newQuota === 0) updateData.status = 'Completed';
            await updateMissionApi(mission.id, updateData);
        }

        try {
            const missionTitle = mission ? mission.title : 'Misi Cuan';
            const messageStr = `🎉 <b>CONGRATULATIONS!</b>\n\n` +
                `Hasil pekerjaan misi <b>${missionTitle}</b> Anda telah diverifikasi!\n\n` +
                `💰 Saldo sebesar <b>Rp ${Number(rewardAmount).toLocaleString('id-ID')}</b> telah berhasil masuk keranjang pencairan.\n\n` +
                `Ayo keruk terus cuanmu di menu: 📋 <b>Daftar Misi</b>! 🚀`;

            await supabase.from('user_notifications').insert({
                user_id: Number(userId),
                type: 'approved',
                mission_id: sub.mission_id,
                message: messageStr
            });
        } catch (e) { console.error('Error inserting notif:', e); }

    }
    fetchSubmissions();
};

window.reject = async (submissionId) => {
    if (!confirm('Tolak bukti ini? User akan mendapat notifikasi.')) return;
    const { error } = await updateSubmissionStatusApi(submissionId, 'Rejected');

    if (error) {
        alert('Gagal menolak.');
    } else {
        const { data: sub } = await getSubmissionMissionIdApi(submissionId);
        if (sub && sub.user_id) {
            try {
                const { data: mission } = await supabase.from('missions').select('title').eq('id', sub.mission_id).single();
                const missionTitle = mission ? mission.title : 'Misi Cuan';
                const messageStr = `⚠️ <b>PERINGATAN DARI SISTEM</b>\n\n` +
                    `Mohon maaf, bukti misi <b>${missionTitle}</b> Anda <b>DITOLAK</b> oleh Admin karena tidak sesuai dengan instruksi yang ditetapkan.\n\n` +
                    `❌ Saldo Misi ini <b>tidak ditambahkan</b>.\n` +
                    `Mari kerjakan dengan lebih teliti! Jangan menyerah! 💪`;

                await supabase.from('user_notifications').insert({
                    user_id: Number(sub.user_id),
                    type: 'rejected',
                    mission_id: sub.mission_id,
                    message: messageStr
                });
            } catch (e) { console.error('Error inserting notif reject:', e); }
        }
        fetchSubmissions();
    }
};

window.saveSetting = async (key) => {
    const newValue = document.getElementById(`setting-${key}`).value;
    const { error } = await updateSettingApi(key, newValue);
    if (error) alert('Error saving: ' + error.message);
    else alert('Saved!');
};

window.previewUpload = (input) => {
    const file = input.files[0];
    if (file) {
        document.getElementById('filename-display').textContent = file.name;
        document.getElementById('upload-action-container').classList.remove('hidden');
        const reader = new FileReader();
        reader.onload = (e) => document.getElementById('preview-qris').src = e.target.result;
        reader.readAsDataURL(file);
    }
};

window.uploadQRIS = async () => {
    const fileInput = document.getElementById('file-qris');
    const statusMsg = document.getElementById('upload-status');
    const file = fileInput.files[0];
    if (!file) return alert('Pilih file gambar terlebih dahulu!');

    try {
        statusMsg.textContent = 'Uploading...';
        statusMsg.className = 'text-xs text-blue-500 mt-1 animate-pulse';
        const fileExt = file.name.split('.').pop();
        const fileName = `qris-${Date.now()}.${fileExt}`;
        const filePath = `qris/${fileName}`;
        // Assuming global 'supabase' for storage?
        // Reuse 'supabase' from window if not imported, or use typed check.
        // Wait, api.js exports 'supabase'. I should import it if I use it.
        // I did NOT import 'supabase' in admin.js imports list.
        // This 'supabase.storage' call MIGHT FAIL if I don't import it.
        // 'window.supabase' is usually lower level.
        // I will fix this by importing 'supabase' from api.js.
        // Wait, I can't change imports inside replace_file_content mid-file.
        // I will rely on global supabase variable here which seems to work for users.
        if (typeof supabase === 'undefined') throw new Error('Supabase client missing');

        const { error: uploadError } = await supabase.storage.from('app-assets').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('app-assets').getPublicUrl(filePath);
        await updateSettingApi('qris_url', publicUrl);
        statusMsg.textContent = 'Success!';
        statusMsg.className = 'text-xs text-green-500 mt-1';
        document.getElementById('preview-qris').src = publicUrl;
        alert('QRIS berhasil diperbarui!');
        fetchSettings();
    } catch (err) {
        statusMsg.textContent = 'Failed: ' + err.message;
        statusMsg.className = 'text-xs text-red-500 mt-1';
        alert('Upload Gagal: ' + err.message);
    }
};

// --- PACKAGE MANAGEMENT (UPDATED) ---
window.editPackage = (id) => {
    const pkg = window.packagesData[id];
    if (!pkg) return;

    document.getElementById('editPkgId').value = pkg.id;
    if (document.getElementById('editPkgName')) document.getElementById('editPkgName').value = pkg.name;
    document.getElementById('editPkgCategory').value = pkg.category;
    if (document.getElementById('editPkgSubCategory')) document.getElementById('editPkgSubCategory').value = pkg.sub_category || '';
    document.getElementById('editPkgPrice').value = pkg.price;
    // Reward input removed
    document.getElementById('editPkgQuota').value = pkg.default_quota || '';

    // Populate Features Builder (Clear first)
    const builder = document.getElementById('features-builder');
    if (builder) {
        builder.innerHTML = '';
        (pkg.features || []).forEach(f => {
            // Updated Parse Logic for "Qty Action @Price"
            const match = f ? f.match(/^([\d.,]+[kmKM]?)\s+(.+?)(?:\s+@(\d+))?$/) : null;
            if (match) {
                // match[1] = Qty, match[2] = Action, match[3] = Price (optional)
                window.addFeatureRow(match[1], match[2], match[3] || '', false);
            } else if (f) {
                window.addFeatureRow('', f, '', false);
            }
        });
    }

    // Checkboxes
    if (document.getElementById('editPkgBestValue')) document.getElementById('editPkgBestValue').checked = pkg.is_best_value || false;
    if (document.getElementById('editPkgDecoy')) document.getElementById('editPkgDecoy').checked = pkg.is_decoy || false;

    // Trigger Initial Calc
    document.getElementById('editPkgPrice').oninput = window.calculateProfit;
    window.calculateProfit();

    document.getElementById('packageModal').classList.remove('hidden');
};

window.closePackageModal = () => {
    document.getElementById('packageModal').classList.add('hidden');
}

window.openPackageModal = (id) => window.editPackage(id);

// --- Manual Mission Creation ---
window.createMission = async () => {
    try {
        const title = document.getElementById('mTitle').value;
        const categoryVal = document.getElementById('mCategory').value; // e.g., TikTok, UMKM
        const actionType = document.getElementById('mPlatform').value; // e.g., Review, Like
        const quota = parseInt(document.getElementById('mQuota').value) || 0;
        const reward = parseInt(document.getElementById('mReward').value) || 0;
        const link = document.getElementById('mLink').value;

        // Basic Validation
        if (!title || !link || quota <= 0) {
            alert('Please fill all required fields correctly (Title, Link, Quota > 0).');
            return;
        }

        const missionData = {
            title: title,
            quota: quota,
            reward: reward,
            link: link,
            status: 'Active',
            // Default mapping
            category: 'UMKM',
            platform_type: categoryVal
        };

        // Smart Categorization
        const sosmedList = ['TikTok', 'YouTube', 'Instagram', 'Facebook'];
        const ecomList = ['Shopee', 'Tokopedia', 'Lazada', 'Google Maps'];

        if (sosmedList.includes(categoryVal)) {
            missionData.category = 'SOSMED';
            missionData.platform_type = categoryVal;
        } else if (ecomList.includes(categoryVal)) {
            missionData.category = 'E-Commerce'; // Or 'UMKM' regarding previous standard? 
            // Let's stick to 'E-Commerce' for Shopee. Gmaps usually 'UMKM' or 'E-Commerce'.
            missionData.platform_type = categoryVal;
        } else {
            missionData.category = 'UMKM';
            missionData.platform_type = 'Review'; // Default for UMKM
        }

        // If action is specific
        if (actionType) {
            // Append action to title if not present? Or just keep it.
        }

        // Call API
        const { data, error } = await insertMissionsApi([missionData]);

        if (error) throw error;

        alert('Mission Created Successfully! 🚀');
        document.getElementById('createMissionForm').reset();
        showSection('active-missions');
        // fetchActiveMissions() called by showSection

    } catch (err) {
        console.error(err);
        alert('Error creating mission: ' + err.message);
    }
};

window.savePackage = async () => {
    const id = document.getElementById('editPkgId').value;
    const category = document.getElementById('editPkgCategory').value;
    const sub_category = document.getElementById('editPkgSubCategory') ? document.getElementById('editPkgSubCategory').value : null;
    const price = parseInt(document.getElementById('editPkgPrice').value);

    const rawQuota = document.getElementById('editPkgQuota').value;
    const default_quota = rawQuota ? parseInt(rawQuota) : null;

    // Harvest Features from Builder
    const featureRows = document.querySelectorAll('#features-builder .feature-row');
    const features = [];
    featureRows.forEach(row => {
        const qty = row.querySelector('.feature-qty').value.trim();
        const action = row.querySelector('.feature-action').value.trim();
        const rwdEl = row.querySelector('.feature-reward');
        let rewardSuffix = '';
        if (rwdEl && rwdEl.value) {
            rewardSuffix = ` @${rwdEl.value}`;
        }

        if (action) {
            if (qty && qty !== '0') features.push(`${qty} ${action}${rewardSuffix}`);
            else features.push(`${action}${rewardSuffix}`);
        }
    });

    const is_best_value = document.getElementById('editPkgBestValue') ? document.getElementById('editPkgBestValue').checked : false;
    const is_decoy = document.getElementById('editPkgDecoy') ? document.getElementById('editPkgDecoy').checked : false;

    const updates = {
        category,
        sub_category: sub_category || null,
        price,
        default_quota,
        features,
        is_best_value,
        is_decoy
    };

    if (document.getElementById('editPkgName')) {
        updates.name = document.getElementById('editPkgName').value;
    }

    const { error } = await updatePackageApi(id, updates);
    if (error) alert('Gagal menyimpan: ' + error.message);
    else {
        alert('Paket berhasil diperbarui!');
        closePackageModal();
        fetchPackages();
    }
};

window.submitAiRequest = async () => {
    const missionId = document.getElementById('aiMissionId').value;
    let context = document.getElementById('aiContext').value;
    let tone = document.getElementById('aiTone').value;
    const quantity = parseInt(document.getElementById('aiQuantity').value);
    const btn = document.getElementById('btnGenerateAi');

    if (!context) return alert('Mohon isi konteks/caption!');

    btn.innerHTML = '⏳ Analyzing...';
    btn.disabled = true;

    // AI Guard: Chek E-Commerce Context
    try {
        const { data: mData } = await supabase.from('missions').select('platform').eq('id', missionId).single();
        if (mData && (mData.platform === 'Shopee' || mData.platform === 'TikTok Shop' || /shop|shopee/i.test(mData.platform))) {
            tone = 'Testimonial (Trustworthy, Packaging Rapi, Admin Ramah)';
            context += ' \n[System Instruction: Generate positive product reviews acting as real buyers. Focus on packaging, delivery speed, and product quality.]';
        }
    } catch (e) { console.warn('AI Guard check failed', e); }

    btn.innerHTML = '⏳ Generating...';

    const { data, error } = await insertAiRequestApi({ mission_id: missionId, context, tone, quantity, status: 'pending' });
    if (error) {
        alert('Error: ' + error.message);
        btn.innerHTML = '⚡ Generate';
        btn.disabled = false;
        return;
    }

    const requestId = data.id;
    let attempts = 0;
    const pollInterval = setInterval(async () => {
        attempts++;
        const { data: req } = await supabase.from('ai_requests').select('status').eq('id', requestId).single();
        if (req.status === 'completed') {
            clearInterval(pollInterval);
            alert('✅ Sukses! Komentar telah digenerate.');
            closeAiModal();
            btn.innerHTML = '⚡ Generate';
            btn.disabled = false;
            document.getElementById('aiContext').value = '';
        } else if (req.status === 'failed' || attempts >= 20) {
            clearInterval(pollInterval);
            alert('❌ Gagal atau Timeout. Silakan coba lagi.');
            btn.innerHTML = '⚡ Generate';
            btn.disabled = false;
        }
    }, 1000);
};

// --- Event Listeners ---

const missionForm = document.getElementById('missionForm');
if (missionForm) {
    missionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = document.getElementById('mOrderId').value;
        const packageFeaturesJson = document.getElementById('mPackageFeatures').value;
        const title = document.getElementById('mTitle').value;
        const category = document.getElementById('mCategory').value;
        const platform = document.getElementById('mPlatform').value;
        const reward = parseInt(document.getElementById('mReward').value);
        const quota = parseInt(document.getElementById('mQuota').value);
        const link = document.getElementById('mLink').value;

        try {
            const url = new URL(link);
            if (category === 'TikTok' && !url.hostname.includes('tiktok')) throw new Error('Link harus dari TikTok!');
            if (category === 'Instagram' && !url.hostname.includes('instagram.com')) throw new Error('Link harus dari Instagram!');
            if (category === 'YouTube' && !url.hostname.includes('youtube.com') && !url.hostname.includes('youtu.be')) throw new Error('Link harus dari YouTube!');
            if (category === 'Facebook' && !url.hostname.includes('facebook.com') && !url.hostname.includes('fb.com')) throw new Error('Link harus dari Facebook!');
        } catch (err) {
            return alert('⚠️ Validasi Link Gagal: ' + err.message);
        }

        // Map Frontend Categories to Database Enum (mission_category)
        // Valid DB Enums: UMKM, TikTok, YouTube, Instagram, Facebook
        let dbCategory = category;
        if (category === 'Google Maps' || category === 'Shopee') {
            dbCategory = 'UMKM';
        }

        if (orderId) {
            // Need supabase client. Rely on global or import?
            // Will reliance on global 'supabase' work?
            // Step 2842 imports didn't include it. 
            // I'll assume global works based on other code.
            const { data: order } = await supabase.from('orders').select('total_price').eq('id', orderId).single();

            if (order) {
                let estimatedTotalCost = 0;

                if (platform === 'Multiple') {
                    estimatedTotalCost = reward;
                } else {
                    estimatedTotalCost = reward * quota;
                }

                if (estimatedTotalCost > order.total_price) {
                    const fmt = (n) => 'Rp ' + n.toLocaleString('id-ID');
                    if (!confirm(`⚠️ PERINGATAN BIAYA:\nTotal modal (Reward ke User): ${fmt(estimatedTotalCost)}\nLebih besar dari Pembayaran Klien: ${fmt(order.total_price)}\n\nAnda akan RUGI. Lanjutkan?`)) return;
                }
            }
        }

        // --- GMaps / Review Context Validation Removed ---
        // Context is now handled via the main 'mContext' field populated by verifyOrder
        // ------------------------------------------------

        let missionsToCreate = [];
        if (platform === 'Multiple' && packageFeaturesJson) {
            const features = JSON.parse(packageFeaturesJson);
            features.forEach(feature => {
                const match = feature.match(/^([\d.,]+[kmKM]?)\s+(.+?)(?:\s+@(\d+))?$/);
                if (match) {
                    let rawQuota = match[1].toLowerCase();
                    const actionText = match[2];
                    const customReward = match[3] ? parseInt(match[3]) : null;

                    let multiplier = 1;
                    if (rawQuota.includes('k')) multiplier = 1000;
                    else if (rawQuota.includes('m')) multiplier = 1000000;
                    rawQuota = rawQuota.replace(/,/g, '.').replace(/[km]/g, '');
                    const q = Math.floor(parseFloat(rawQuota) * multiplier);

                    const { type, reward: detectedReward } = window.mapActionAndReward(actionText);
                    const finalReward = customReward !== null ? customReward : detectedReward;

                    missionsToCreate.push({ title: `${title} (${actionText})`, category: dbCategory, platform_type: type, reward: finalReward, quota: q, link, status: 'Active' });
                }
            });
            if (missionsToCreate.length > 0) {
                const confirmMsg = `Konfirmasi Publikasi ${missionsToCreate.length} misi?\n\n` + missionsToCreate.map(m => `- ${m.platform_type}: ${m.quota} slots`).join('\n');
                if (!confirm(confirmMsg)) return;
            }
        } // End of Multiple Platform Check

        // If no missions created (either not Multiple, or loop empty), use Single Mission logic
        if (missionsToCreate.length === 0) {
            missionsToCreate.push({ title, category: dbCategory, platform_type: platform, reward, quota, link, status: 'Active' });
        }

        const { data: createdMissions, error: insertError } = await insertMissionsApi(missionsToCreate);
        if (insertError) return alert('Gagal membuat misi: ' + insertError.message);

        if (createdMissions && createdMissions.length > 0) {
            const commentTypes = ['Comment', 'Review', 'Ulasan', 'Komentar'];
            const autoGenMissions = createdMissions.filter(m => commentTypes.includes(m.platform_type));

            if (autoGenMissions.length > 0) {
                let context = document.getElementById('mContext').value;
                // Combine with Auto Context if available
                if (typeof autoAiContext !== 'undefined' && autoAiContext) {
                    context = autoAiContext + (context ? `\n\nTambahan: ${context}` : "");
                }
                const tone = document.getElementById('mTone').value;

                if (context) {
                    for (const m of autoGenMissions) {
                        await insertAiRequestApi({
                            mission_id: m.id,
                            context: context,
                            tone: tone,
                            quantity: m.quota,
                            status: 'pending'
                        });
                    }
                    alert(`✅ Misi Berhasil Dibuat!\n🤖 AI sedang otomatis membuat ${autoGenMissions.length} set komentar/review unik.`);
                } else {
                    alert('✅ Misi Berhasil Dibuat (Tanpa AI karena Context kosong).');
                }
            } else {
                alert('✅ Misi Berhasil Dibuat!');
            }
        }

        alert('Misi berhasil dibuat!');
        missionForm.reset();
        if (window.resetManualInputs) window.resetManualInputs(); // SAFE CALL
        fetchSubmissions();
    });
}

const playNotificationSound = () => {
    try {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
        audio.play().catch(e => console.log('Audio play failed (user interaction needed first):', e));
    } catch (e) { console.error(e); }
};

const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white font-bold shadow-lg transform transition-all duration-300 translate-y-10 opacity-0 z-50 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-600'}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.fetchOrders = fetchOrders;
window.fetchSubmissions = fetchSubmissions;
window.fetchSettings = fetchSettings;
window.fetchPackages = fetchPackages;

// Initial data load for settings and packages (non-realtime critical)
fetchSettings();
fetchPackages();

const pkgSelect = document.getElementById('mPackageSelect');
if (pkgSelect) {
    pkgSelect.onchange = (e) => applyPackageTemplate(e.target.value);
}

// --- CSV Export/Import Logic ---

window.exportPackagesToCSV = () => {
    const data = Object.values(window.packagesData || {});
    if (data.length === 0) return alert('No packages to export');

    const headers = ['Action', 'ID', 'Category', 'SubCategory', 'Name', 'Price',
        'F1 Label', 'F1 Price',
        'F2 Label', 'F2 Price',
        'F3 Label', 'F3 Price',
        'F4 Label', 'F4 Price',
        'F5 Label', 'F5 Price',
        'BestValue', 'Decoy', 'Quota', 'OrderIndex'];

    // Helper to escape CSV values (handle commas, quotes, newlines)
    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    let csvContent = headers.map(escapeCsv).join(',') + '\n';

    data.forEach(pkg => {
        const row = [
            'UPDATE', // Hint column for users
            pkg.id,
            pkg.category,
            pkg.sub_category,
            pkg.name,
            pkg.price,
            // Split Features into Label and Price Columns
            ...(Array.isArray(pkg.features) ? pkg.features : JSON.parse(pkg.features || '[]'))
                .map(f => typeof f === 'string' ? f : (f.label || JSON.stringify(f)))
                .concat(['', '', '', '', '']).slice(0, 5) // Pad to 5 features
                .flatMap(f => {
                    if (!f) return ['', ''];
                    const match = f.match(/(.*)\s+@(\d+)/);
                    if (match) return [match[1].trim(), match[2].trim()];
                    return [f, ''];
                }),
            pkg.is_best_value,
            pkg.is_decoy,
            pkg.default_quota,
            pkg.order_index || 0
        ];
        csvContent += row.map(escapeCsv).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `misicuan_packages_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Add User Feedback
    if (typeof showToast === 'function') showToast('✅ Export Successful! format: Feature Split Columns', 'success');
};

window.importPackagesFromCSV = async (input) => {
    const file = input.files[0];
    if (!file) return;

    if (!confirm('⚠️ PERINGATAN IMPORT:\n\n1. Data dengan ID yang sama akan di-UPDATE.\n2. Data tanpa ID (kosong) akan di-INSERT sebagai BARU.\n3. Pastikan format CSV valid (gunakan hasil Export sebagai template).\n\nLanjutkan import?')) {
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n');

        // Robust CSV Line Parser (handles quoted commas)
        const parseCsvLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"'; // Escaped quote
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current);
            return result;
        };

        let successCount = 0;
        let failCount = 0;
        let errors = [];

        // Skip Header (row 0)
        for (let i = 1; i < rows.length; i++) {
            const line = rows[i].trim();
            if (!line) continue;

            try {
                const cols = parseCsvLine(line);
                if (cols.length < 5) continue; // Basic check

                const id = cols[1]; // ID is col 1

                const pkgData = {
                    category: cols[2],
                    sub_category: (cols[3] === 'null' || !cols[3]) ? null : cols[3],
                    name: cols[4],
                    price: parseInt(cols[5]) || 0,
                    // Reconstruct Features Array from Label/Price pairs (index 6-15)
                    features: (() => {
                        const feats = [];
                        for (let k = 0; k < 5; k++) {
                            const lbl = cols[6 + (k * 2)];
                            const prc = cols[7 + (k * 2)];
                            if (lbl && lbl.trim()) {
                                feats.push(prc && prc.trim() ? `${lbl.trim()} @${prc.trim()}` : lbl.trim());
                            }
                        }
                        return feats;
                    })(),
                    is_best_value: cols[16] === 'true',
                    is_decoy: cols[17] === 'true',
                    default_quota: parseInt(cols[18]) || 10,
                    order_index: parseInt(cols[19]) || 0
                };

                let error = null;

                // Check if ID is a valid UUID (simple check length > 20)
                if (id && id.length > 20) {
                    // Update
                    const { error: err } = await supabase.from('packages').update(pkgData).eq('id', id);
                    error = err;
                } else {
                    // Insert
                    const { error: err } = await supabase.from('packages').insert(pkgData);
                    error = err;
                }

                if (error) throw error;
                successCount++;
            } catch (err) {
                console.error(`Row ${i} Error:`, err);
                failCount++;
                errors.push(`Row ${i}: ${err.message}`);
            }
        }

        let msg = `✅ Import Selesai!\nSukses: ${successCount}\nGagal: ${failCount}`;
        if (failCount > 0) msg += `\n\nDetail Error:\n${errors.slice(0, 5).join('\n')}`;
        alert(msg);

        fetchPackages(); // Refresh Table
        input.value = ''; // Reset File Input
    };

    reader.readAsText(file);
};

// --- INITIALIZATION ---
const initDashboard = () => {
    console.log('🚀 Admin Dashboard Initializing...');

    // 1. Fetch Data
    fetchOrders();
    fetchActiveMissions();
    fetchSubmissions();
    fetchProfiles();
    fetchClients();

    // 2. Setup Realtime (Single source of truth)
    // Robust Implementation with silent Polling Fallback
    const setupRealtime = () => {
        if (typeof supabase === 'undefined') {
            console.error('❌ Supabase client not initialized. Realtime disabled.');
            startPolling();
            return;
        }

        const updateStatus = (status) => {
            const el = document.getElementById('realtime-status');
            if (!el) return;

            if (status === 'connected') {
                el.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500 animate-bounce"></span> Live';
                el.className = 'flex items-center gap-2 text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 shadow-sm';
            } else if (status === 'polling') {
                el.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Auto Refresh';
                el.className = 'flex items-center gap-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200';
            } else {
                el.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-300 animate-pulse"></span> Connecting...';
                el.className = 'flex items-center gap-2 text-xs font-normal text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200';
            }
        };

        const startPolling = () => {
            if (!window.pollingInterval) {
                console.log('🔄 Polling mode active (every 10s)');
                window.pollingInterval = setInterval(() => {
                    fetchOrders();
                    if (window.fetchActiveMissions) window.fetchActiveMissions();
                }, 10000);
            }
            updateStatus('polling');
        };

        updateStatus('connecting');
        if (window.pollingInterval) { clearInterval(window.pollingInterval); window.pollingInterval = null; }

        console.log('🔄 Initializing Realtime Subscription...');
        supabase.removeAllChannels();

        const channel = supabase.channel('admin-dashboard-v2')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                console.log('🔔 Realtime Order Update:', payload);
                fetchOrders();
                if (payload.eventType === 'INSERT') {
                    const client = payload.new.client_name || 'Guest';
                    if (typeof playNotificationSound === 'function') playNotificationSound();
                    if (typeof showToast === 'function') showToast(`🔔 Pesanan Baru dari ${client}!`, 'success');
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => {
                console.log('🔔 Realtime Mission Update');
                if (window.fetchActiveMissions) window.fetchActiveMissions();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, (payload) => {
                console.log('🔔 Realtime Submission Update');
                fetchSubmissions();
                if (payload.eventType === 'INSERT') {
                    if (typeof playNotificationSound === 'function') playNotificationSound();
                    if (typeof showToast === 'function') showToast('📬 Bukti baru diterima!', 'info');
                }
            })
            .subscribe((status, err) => {
                console.log('Realtime Status:', status, err || '');
                if (status === 'SUBSCRIBED') {
                    updateStatus('connected');
                    // Stop polling — we have live connection
                    if (window.pollingInterval) {
                        clearInterval(window.pollingInterval);
                        window.pollingInterval = null;
                    }
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.warn('Realtime unavailable, using auto-refresh:', err || status);
                    startPolling();
                }
            });
    };

    setupRealtime();
};

// --- GLOBAL PRICING & MARGIN STRATEGY ---

console.log('Global Pricing Script Loaded');

window.openGlobalPricingModal = () => {
    console.log('Opening Global Pricing Modal...');
    // Renamed ID
    const modal = document.getElementById('globalPricingModal');
    if (!modal) {
        console.error('Error: globalPricingModal element not found!');
        alert('Error: Modal element not found. Please refresh.');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    // Default margin 20%
    const marginInput = document.getElementById('selectedMargin');
    if (marginInput && !marginInput.value) window.selectMargin(20);
};

// Fallback for button
window.openPricingModal = window.openGlobalPricingModal;

window.closePricingModal = () => {
    document.getElementById('globalPricingModal').classList.add('hidden');
    document.getElementById('globalPricingModal').classList.remove('flex');
};

window.selectMargin = (val) => {
    document.getElementById('selectedMargin').value = val;
    document.querySelectorAll('.btn-margin').forEach(btn => {
        if (parseInt(btn.getAttribute('data-val')) === val) {
            btn.classList.add('bg-green-600', 'text-white', 'border-green-600');
            btn.classList.remove('bg-white', 'text-green-700', 'border-green-200');
        } else {
            btn.classList.remove('bg-green-600', 'text-white', 'border-green-600');
            btn.classList.add('bg-white', 'text-green-700', 'border-green-200');
        }
    });
};

window.applyPricingStrategy = async () => {
    const marginEl = document.getElementById('selectedMargin');
    if (!marginEl) return alert('System Error: Margin Input missing');
    const margin = parseInt(marginEl.value);
    if (!margin) return alert('Pilih target margin dulu!');

    // Get Rates with Fallbacks
    const getVal = (id) => parseInt(document.getElementById(id)?.value || 0);
    const rateFollow = getVal('rateFollow');
    const rateLike = getVal('rateLike');
    const rateView = getVal('rateView');
    const rateComment = getVal('rateComment');
    const rateReview = getVal('rateReview');
    const rateOther = getVal('rateOther');

    // Confirmation
    if (!confirm(`⚠️ WARNING: This will RECALCULATE quantities for ALL packages!\n\nTarget Margin: ${margin}%\n\nAre you sure?`)) return;

    const btn = document.getElementById('btnApplyPricing');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Processing... (Do not close)';
    btn.disabled = true;

    try {
        // 1. Fetch All Packages (using global supabase if import fails, or imported one)
        const client = (typeof supabase !== 'undefined') ? supabase : window.supabase;
        if (!client) throw new Error('Supabase client not initialized');

        const { data: allPackages, error: fetchError } = await client.from('packages').select('*');
        if (fetchError) throw fetchError;

        let updatedCount = 0;

        // 2. Iterate and Recalculate
        for (const pkg of allPackages) {
            let features = Array.isArray(pkg.features) ? pkg.features : (typeof pkg.features === 'string' ? JSON.parse(pkg.features || '[]') : []);
            const price = pkg.price;

            // Calculate Maximum Cost Allowed (Price - Margin)
            const maxCost = price * (1 - (margin / 100));

            // Parse features to find current ratios
            let weightedSum = 0;
            let baseFeatureQty = 0;
            let featureMeta = [];

            // First Pass: Parse, Identify, and STANDARDIZE Names
            for (const f of features) {
                const match = typeof f === 'string' ? f.match(/(\d+)\s+(.+?)\s+@(\d+)/) : null;

                if (match) {
                    const oldQty = parseInt(match[1]);
                    let name = match[2].trim();

                    // --- STANDARDIZE TERMINOLOGY ---
                    if (/page like/i.test(name)) name = 'Followers';
                    if (/subscriber/i.test(name)) name = 'Subscribers'; // Keep subscribers for YT
                    // -------------------------------

                    // Determine New Rate
                    let newRate = rateOther;
                    if (/follow|sub|page like|followers/i.test(name)) newRate = rateFollow;
                    else if (/like/i.test(name)) newRate = rateLike;
                    else if (/view/i.test(name)) newRate = rateView;
                    else if (/comment/i.test(name)) newRate = rateComment;
                    else if (/rating|review|ulasan|bintang/i.test(name)) newRate = rateReview;

                    featureMeta.push({ originalString: f, oldQty, name, newRate, isFixed: false });

                    if (baseFeatureQty === 0) baseFeatureQty = oldQty;
                } else {
                    featureMeta.push({ originalString: f, isFixed: true });
                }
            }

            // Second Pass: Calculate Ratios
            if (baseFeatureQty > 0) {
                for (const item of featureMeta) {
                    if (!item.isFixed) {
                        const ratio = item.oldQty / baseFeatureQty;
                        weightedSum += ratio * item.newRate;
                        item.ratio = ratio;
                    }
                }
            }

            // Third Pass: Calculate New Quantities
            if (weightedSum > 0) {
                const newBaseQty = Math.floor(maxCost / weightedSum);

                const newFeatures = featureMeta.map(item => {
                    if (item.isFixed) return item.originalString;

                    // Scale Qty
                    let newQty = Math.floor(newBaseQty * item.ratio);

                    // Aesthetic Rounding
                    if (newQty > 1000) newQty = Math.round(newQty / 100) * 100;
                    else if (newQty > 100) newQty = Math.round(newQty / 10) * 10;
                    else if (newQty > 0) newQty = Math.max(1, Math.round(newQty));

                    return `${newQty} ${item.name} @${item.newRate}`;
                });

                // Update DB
                const { error: updateError } = await client
                    .from('packages')
                    .update({ features: newFeatures })
                    .eq('id', pkg.id);

                if (updateError) console.error(`Failed to update ${pkg.name}`, updateError);
                else updatedCount++;

            } else {
                console.warn(`Skipping ${pkg.name}: Zero cost sum or fixed features only.`);
            }
        }

        alert(`✅ Success! Updated ${updatedCount} packages.\nProfit Margin stabilized at ${margin}%.`);
        if (window.closePricingModal) window.closePricingModal();
        if (window.fetchPackages) fetchPackages();

    } catch (err) {
        console.error(err);
        alert('❌ Error: ' + err.message);
    } finally {
        btn.innerHTML = originalText || '⚡ Apply to All Packages';
        btn.disabled = false;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}


