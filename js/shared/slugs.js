// shared/slugs.js — slug/name conversion utilities, no DOM

function slugToName(slug) {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function nameToSlug(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function slugToCode(slug) {
    const parts = slug.split('-');
    return parts[parts.length - 1].slice(0, 3).toUpperCase();
}

function slugLastName(slug) {
    return slugToName(slug.split('-').pop());
}