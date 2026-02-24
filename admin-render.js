/**
 * admin-render.js
 * Handles HTML string generation for Admin Dashboard tables.
 * Separated from main logic for maintainability and performance.
 */

// XSS Protection: Escape HTML entities in user-generated content
const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

export const renderActiveMissionsHTML = (missions) => {
    if (!missions || missions.length === 0) {
        return `<tr><td colspan="5" class="p-4 text-center text-slate-400">No active missions found.</td></tr>`;
    }

    return missions.map(m => {
        const taken = m.taken || 0;
        const quota = m.quota || 0;
        const reward = m.reward || 0;
        const progress = quota > 0 ? (taken / quota) * 100 : 0;

        return `
        <tr class="border-b border-indigo-500/10 hover:bg-indigo-500/5 transition group">
            <td class="p-4">
                <div class="font-bold text-white">${escapeHtml(m.title)}</div>
                <a href="${escapeHtml(m.link)}" target="_blank" class="text-xs text-cyan-400 hover:underline max-w-[200px] truncate block">${escapeHtml(m.link)}</a>
            </td>
            <td class="p-4">
                <div class="text-sm text-slate-300">${m.category}</div>
                <div class="text-xs text-purple-400 font-bold">${m.platform_type}</div>
            </td>
            <td class="p-4">
                <div class="flex items-center gap-2">
                    <div class="w-full bg-slate-700 rounded-full h-2.5 w-24">
                        <div class="bg-indigo-500 h-2.5 rounded-full" style="width: ${progress}%"></div>
                    </div>
                    <span class="text-xs font-bold text-cyan-300">${taken}/${quota}</span>
                </div>
            </td>
            <td class="p-4 font-mono text-sm text-emerald-400">Rp ${reward.toLocaleString('id-ID')}</td>
            <td class="p-4 text-right">
                <button onclick="window.deleteMission('${m.id}')" class="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-500/10 transition" title="Delete/Archive">
                    🗑️
                </button>
            </td>
        </tr>
    `;
    }).join('');
};

export const renderOrdersHTML = (orders) => {
    if (!orders || orders.length === 0) {
        return '<tr><td colspan="6" class="p-4 text-center text-slate-400">No orders found.</td></tr>';
    }

    return orders.map(order => {
        const safeLink = (order.social_link || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
        const safePkgName = (order.package_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
        const safeClientName = (order.client_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');

        let statusColor = 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20';
        if (order.status === 'verified') statusColor = 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20';
        if (order.status === 'rejected') statusColor = 'bg-red-500/15 text-red-300 border border-red-500/20';

        const isVerified = order.status === 'verified';

        // AI Context Block
        const aiContextBlock = order.user_instructions ? (() => {
            const ctx = order.user_instructions;
            return `
                <div class="mt-2 bg-indigo-500/10 border border-indigo-500/20 p-2 rounded text-[10px] text-indigo-300 max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md whitespace-normal break-words">
                    <div class="font-bold flex items-center gap-1 mb-1 text-indigo-200">🤖 Smart Context</div>
                    ${ctx.topic ? `<div><span class="font-semibold text-indigo-300">Topik:</span> ${ctx.topic}</div>` : ''}
                    ${ctx.tone ? `<div><span class="font-semibold text-indigo-300">Tone:</span> ${ctx.tone}</div>` : ''}
                    ${ctx.points ? `<div><span class="font-semibold text-indigo-300">Poin:</span> ${ctx.points}</div>` : ''}
                </div>`;
        })() : '';

        // Action Buttons
        const actionButtons = !isVerified ? `
            <button onclick="window.verifyOrder('${order.id}', '${safePkgName}', '${safeLink}', ${order.total_price}, '${safeClientName}')" 
                class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-indigo-500/20 transition transform hover:-translate-y-0.5">
                Verify & Draft
            </button>
            <button onclick="window.rejectOrder('${order.id}')" 
                class="text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-bold transition ml-2">
                Start Reject
            </button>
            ${order.user_instructions ? `<div class="mt-1 text-[10px] text-purple-300 font-bold bg-purple-500/10 p-1 rounded border border-purple-500/20 flex items-center gap-1 justify-center max-w-[120px] mx-auto"><span class="animate-pulse">✨</span> AI Context</div>` : ''}
            ` : `
            <div class="flex items-center gap-2 justify-end">
                <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">Processed</span>
                <button onclick="window.resetOrderStatus('${order.id}')" 
                    class="text-xs text-slate-400 hover:text-cyan-400 border border-slate-600 hover:border-cyan-500/50 px-2 py-1 rounded transition" 
                    title="Reset to Pending (Re-process)">
                    ↺ Reset
                </button>
            </div>
            `;

        const orderDate = order.created_at ? new Date(order.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

        return `
        <tr class="border-b border-indigo-500/10 hover:bg-indigo-500/5 transition">
            <td class="p-4 text-xs text-slate-300 whitespace-nowrap">
                ${orderDate}
            </td>
            <td class="p-4">
                <div class="font-bold text-white">${escapeHtml(order.client_name) || 'Guest'}</div>
                <div class="text-xs text-slate-400">${escapeHtml(order.client_whatsapp) || '-'}</div>
            </td>
            <td class="p-4">
                <div class="font-medium text-cyan-400">${order.package_name}</div>
                <div class="text-xs text-slate-500 font-mono mt-1 truncate w-32" title="${order.social_link}">${order.social_link || '-'}</div>
                ${aiContextBlock}
            </td>
            <td class="p-4 font-bold text-emerald-400">
                Rp ${order.total_price.toLocaleString('id-ID')}
            </td>
            <td class="p-4">
                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusColor}">
                    ${order.status}
                </span>
            </td>
            <td class="p-4 text-right">
                ${actionButtons}
            </td>
        </tr>
        `;
    }).join('');
};

export const renderPackagesHTML = (packages) => {
    let lastCategory = '';
    return packages.map(pkg => {
        let rows = '';
        if (pkg.category !== lastCategory) {
            rows += `
             <tr class="bg-indigo-500/5 border-b border-indigo-500/15">
                 <td colspan="5" class="p-3 text-xs font-bold text-cyan-400 uppercase tracking-wider pl-4">
                     ${pkg.category}
                 </td>
             </tr>
             `;
            lastCategory = pkg.category;
        }

        const isBestValue = pkg.is_best_value || (pkg.name && pkg.name.toLowerCase().includes('sultan'));
        const isHighSafety = (pkg.category === 'Shopee' || pkg.category === 'TikTok Shop') && isBestValue;

        const rowClass = isBestValue ? 'bg-amber-500/5 border-l-4 border-l-amber-400' : 'hover:bg-indigo-500/5 border-l-4 border-l-transparent';

        let badges = '';
        if (isBestValue) badges += '<br><span class="inline-block mt-1 bg-amber-500/15 text-amber-300 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wide font-bold">👑 Best Value</span>';
        if (isHighSafety) badges += '<span class="inline-block mt-1 ml-1 bg-emerald-500/15 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wide font-bold">🛡️ Safely Guided</span>';

        const priceClass = isBestValue ? 'text-amber-400 text-lg' : 'text-emerald-400';

        const featureTooltip = pkg.features ? pkg.features.join(', ') : '';
        const featureDisplay = pkg.features ? pkg.features.slice(0, 3).join(', ') + (pkg.features.length > 3 ? '...' : '') : '-';

        rows += `
         <tr class="border-b border-indigo-500/10 transition ${rowClass}">
             <td class="p-4 pl-8"> <!-- Indent content slightly -->
                 <div class="font-bold text-white">${pkg.sub_category || '-'}</div>
                 <div class="text-xs text-slate-500 mt-1">Idx: ${pkg.order_index}</div>
             </td>
             <td class="p-4">
                 <div class="font-medium text-slate-200">${pkg.name}</div>
                 ${badges}
             </td>
             <td class="p-4 font-bold ${priceClass}">Rp ${pkg.price.toLocaleString('id-ID')}</td>
             <td class="p-4">
                 <div class="text-xs text-slate-400 max-w-[250px] truncate mb-2" title="${featureTooltip}">
                     ${featureDisplay}
                 </div>
             </td>
             <td class="p-4 text-right">
                 <button onclick="window.openPackageModal('${pkg.id}')" class="bg-indigo-500/10 border border-indigo-500/20 text-cyan-400 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition">
                     ✏️ Edit
                 </button>
                 ${isBestValue ? '<button class="ml-1 bg-amber-500/15 text-amber-300 px-2 py-1 rounded text-xs font-bold border border-amber-500/20" title="Best Value Items cannot be deleted easily">★</button>' : ''}
             </td>
         </tr>
         `;
        return rows;
    }).join('');
};
