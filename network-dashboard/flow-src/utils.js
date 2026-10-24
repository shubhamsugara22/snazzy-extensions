export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

export function formatMs(v) {
  return typeof v === 'number' && isFinite(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v)} ms` : 'n/a';
}

export const TYPE_META = {
  script: { label: 'Scripts', color: '#f59e0b', icon: '{ }' },
  style: { label: 'Stylesheets', color: '#8b5cf6', icon: '#' },
  image: { label: 'Images', color: '#22c55e', icon: '▣' },
  api: { label: 'API / Fetch', color: '#1a5cff', icon: '⇄' },
  font: { label: 'Fonts', color: '#ec4899', icon: 'Aa' },
  other: { label: 'Other', color: '#94a3b8', icon: '…' }
};

export function classifyType(r) {
  const init = r.initiatorType;
  if (init === 'script') return 'script';
  if (init === 'css' || init === 'link') {
    return /\.(woff2?|ttf|otf)(\?|$)/i.test(r.name) ? 'font' : 'style';
  }
  if (init === 'img' || init === 'image') return 'image';
  if (init === 'fetch' || init === 'xmlhttprequest' || init === 'beacon') return 'api';
  return 'other';
}

export function hostOf(url) {
  try { return new URL(url).hostname; } catch { return 'unknown'; }
}

const rootDomain = h => h.split('.').slice(-2).join('.');

export function isFirstParty(host, pageHost) {
  if (!pageHost || pageHost === 'unknown') return false;
  return host === pageHost || rootDomain(host) === rootDomain(pageHost);
}
