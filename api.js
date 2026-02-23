import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Orders API ---
export async function fetchOrdersApi() {
    return await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
}

export async function updateOrderStatusApi(orderId, status) {
    return await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);
}

export async function getSingleOrderApi(orderId) {
    return await supabase
        .from('orders')
        .select('total_price')
        .eq('id', orderId)
        .single();
}

export async function deleteClientLinkApi(clientPhone, targetLink) {
    return await supabase
        .from('orders')
        .update({ social_link: null })
        .eq('client_whatsapp', clientPhone)
        .eq('social_link', targetLink);
}

// --- Missions API ---
export async function insertMissionsApi(missionsToCreate) {
    return await supabase
        .from('missions')
        .insert(missionsToCreate)
        .select();
}

// --- Submissions API ---
export async function fetchSubmissionsApi() {
    return await supabase
        .from('submissions')
        .select(`
            *,
            missions(title, reward, quota),
            profiles(username, full_name, phone_number)
        `)
        .eq('status', 'Pending')
        .order('created_at', { ascending: true });
}

export async function updateSubmissionStatusApi(submissionId, status) {
    return await supabase
        .from('submissions')
        .update({ status })
        .eq('id', submissionId);
}

export async function getSubmissionMissionIdApi(submissionId) {
    return await supabase
        .from('submissions')
        .select('mission_id, user_id')
        .eq('id', submissionId)
        .single();
}

export async function getMissionQuotaApi(missionId) {
    return await supabase
        .from('missions')
        .select('quota, id, title')
        .eq('id', missionId)
        .single();
}

export async function updateMissionApi(missionId, updateData) {
    return await supabase
        .from('missions')
        .update(updateData)
        .eq('id', missionId);
}

// --- Profiles API ---
export async function getProfileBalanceApi(userId) {
    return await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();
}

export async function updateProfileBalanceApi(userId, newBalance) {
    return await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);
}

export async function fetchAllProfilesApi() {
    return await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
}

// --- AI Requests API ---
export async function insertAiRequestApi(requestData) {
    return await supabase
        .from('ai_requests')
        .insert(requestData)
        .select()
        .single();
}

export async function getAiRequestStatusApi(requestId) {
    return await supabase
        .from('ai_requests')
        .select('*')
        .eq('id', requestId)
        .single();
}

// --- Settings API ---
export async function fetchSettingsApi() {
    return await supabase
        .from('app_settings')
        .select('*')
        .order('key');
}

export async function updateSettingApi(key, value) {
    return await supabase
        .from('app_settings')
        .upsert({ key, value }, { onConflict: 'key' });
}

// --- Packages API ---
export async function fetchPackagesApi() {
    return await supabase
        .from('packages')
        .select('*')
        .order('category')
        .order('order_index');
}

export async function updatePackageApi(id, updateData) {
    return await supabase
        .from('packages')
        .update(updateData)
        .eq('id', id);
}

// --- AI Direct Invocation API ---
export async function invokeAiFunction(payload) {
    const { data, error } = await supabase.functions.invoke('generate-comment', {
        body: payload
    });
    if (error) throw error;
    return data;
}
