// SUPABASE INITIALIZATION
// Loaded on every page after the supabase-js CDN script.
const SUPABASE_URL = 'https://tbvscjpaqbyshqoieqvu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-hkHAjdrka8bJy8GSqbR_g_hPVQuTy5';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PROFILE PICTURES
// The avatars bucket is private, so pictures are shown through
// short-lived signed URLs. Profiles store the file path
// ("<user id>/avatar.jpg"); older profiles store a full public URL.
function getAvatarPath(value) {
    if (!value) {
        return "";
    }

    const marker = "/avatars/";
    const index = value.indexOf(marker);
    const path = index === -1 ? value : value.slice(index + marker.length);

    try {
        return decodeURIComponent(path.split("?")[0]);
    } catch (error) {
        return "";
    }
}

// Returns a signed URL for each stored value, in the same order
// ("" when a picture is missing or can't be loaded).
async function getAvatarUrls(values) {
    const paths = values.map(getAvatarPath);
    const wanted = paths.filter(Boolean);

    if (wanted.length === 0) {
        return paths.map(function() { return ""; });
    }

    const { data, error } = await _supabase.storage
        .from("avatars")
        .createSignedUrls(wanted, 3600);

    if (error || !data) {
        return paths.map(function() { return ""; });
    }

    const urls = {};
    data.forEach(function(item) {
        if (item.signedUrl) {
            urls[item.path] = item.signedUrl;
        }
    });

    return paths.map(function(path) { return urls[path] || ""; });
}
