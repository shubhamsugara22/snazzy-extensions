// Tab switching
import { webVitals } from './modules/web-vitals.js';
import { bandwidthMonitor } from './modules/bandwidth-monitor.js';

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Helper functions
async function getPublicIp() {
  const res = await fetch('https://api.ipify.org?format=json');
  const data = await res.json();
  return data.ip;
}

async function getServerIp(domain) {
  const res = await fetch(`https://dns.google/resolve?name=${domain}`);
  const data = await res.json();
  if (data.Answer && data.Answer.length > 0) {
    const answer = data.Answer.find(a => a.type === 1);
    return answer ? answer.data : 'Not found';
  }
  return 'Not found';
}

// Show network info (using current site, e.g., google.com fallback)
async function showNetworkInfo() {
  let domain = "www.google.com"; // fallback if tabs API isn't available
  try {
    // Prefer tabId passed via query string
    const params = new URLSearchParams(location.search);
    const passedTabId = params.get('tabId');
    if (passedTabId) {
      const tabId = parseInt(passedTabId, 10);
      const t = await chrome.tabs.get(tabId);
      domain = t && t.url ? new URL(t.url).hostname : domain;
    } else if (chrome && chrome.tabs) {
      const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      domain = tab && tab.url ? new URL(tab.url).hostname : domain;
    }
  } catch (e) {
    // ignore and use fallback
  }

  const publicIp = await getPublicIp().catch(() => 'Unavailable');
  const serverIp = await getServerIp(domain).catch(() => 'Unavailable');
  document.getElementById('network-details').innerHTML = `
    <strong>Your Public IP:</strong> ${publicIp}<br>
    <strong>Current Domain:</strong> ${domain}<br>
    <strong>Server IP:</strong> ${serverIp}<br>
  `;
}
showNetworkInfo();

// Utility: read tabId from query param if present
function getPassedTabId() {
  try {
    const params = new URLSearchParams(location.search);
    const id = params.get('tabId');
    return id ? parseInt(id, 10) : null;
  } catch {
    return null;
  }
}

// Collect metrics from the active tab by injecting a small collector.
async function collectNetworkMetrics() {
  const metricsResultEl = document.getElementById('metricsResult');
  metricsResultEl.innerText = 'Collecting metrics...';
  try {
    // Determine tab id: prefer passed value from background, else query active tab
    let tabId = getPassedTabId();
    if (!tabId) {
      const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      tabId = tab && tab.id;
    }
    if (!tabId) throw new Error('No active tab available to collect metrics from.');

    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Collect resource timing, navigation timing, and connection info
        const resources = performance.getEntriesByType('resource').map(r => ({
          name: r.name,
          initiatorType: r.initiatorType,
          duration: r.duration,
          transferSize: r.transferSize || 0,
          encodedBodySize: r.encodedBodySize || 0,
          decodedBodySize: r.decodedBodySize || 0,
        }));
        const navigation = (performance.getEntriesByType('navigation') || [])[0] || {};
        const connection = (navigator && navigator.connection) ? {
          downlink: navigator.connection.downlink,
          effectiveType: navigator.connection.effectiveType,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData
        } : null;
        return {resources, navigation, connection, collectedAt: Date.now()};
      }
    });

    const payload = injection && injection[0] && injection[0].result ? injection[0].result : null;
    if (!payload) throw new Error('No metrics returned from content script.');

    // Summarize key metrics for easy debugging
    const conn = payload.connection;
    const nav = payload.navigation || {};
    const resources = payload.resources || [];

    // Compute resource aggregates
    const totalResources = resources.length;
    const totalTransfer = resources.reduce((s, r) => s + (r.transferSize || 0), 0);
    const largestResource = resources.reduce((best, r) => (r.transferSize || 0) > (best.transferSize || 0) ? r : best, resources[0] || {});

    // Navigation time breakdown
    const keyMetrics = [];
    const ms = (v) => (typeof v === 'number' ? `${v.toFixed(2)} ms` : 'n/a');
    const safe = (a,b)=> (typeof a==='number'?a:b);

    const dnsTime = safe(nav.domainLookupEnd - nav.domainLookupStart, null);
    const tcpTime = safe(nav.connectEnd - nav.connectStart, null);
    const tlsTime = (nav.secureConnectionStart && nav.secureConnectionStart > 0) ? (nav.connectEnd - nav.secureConnectionStart) : null;
    const requestTime = safe(nav.responseStart - nav.requestStart, null); // TTFB
    const responseTime = safe(nav.responseEnd - nav.responseStart, null);
    const domContent = safe(nav.domContentLoadedEventEnd, null);
    const loadEvent = safe(nav.loadEventEnd, null);
    const totalLoad = safe(nav.duration, null);

     // Collect Web Vitals
    const vitals = await webVitals.collectMetrics();
    updateWebVitalsDisplay(vitals);

    // Collect Bandwidth Information
    const connectionInfo = bandwidthMonitor.measureConnectionSpeed();
    const bandwidthUsage = bandwidthMonitor.calculateBandwidthUsage(resources);
    updateBandwidthDisplay(connectionInfo, bandwidthUsage);

    keyMetrics.push({label:'DNS Lookup', value:dnsTime});
    keyMetrics.push({label:'TCP Connect', value:tcpTime});
    if (tlsTime !== null) keyMetrics.push({label:'TLS Handshake', value:tlsTime});
    keyMetrics.push({label:'TTFB (request→responseStart)', value:requestTime});
    keyMetrics.push({label:'Response Transfer', value:responseTime});
    keyMetrics.push({label:'DOMContentLoaded (ms)', value:domContent});
    keyMetrics.push({label:'Load Event End (ms)', value:loadEvent});
    keyMetrics.push({label:'Total Load Duration (ms)', value:totalLoad});

    // Paint metrics
    const paints = performance.getEntriesByType ? performance.getEntriesByType('paint') : [];
    const firstPaint = (paints.find(p=>p.name==='first-paint') || {}).startTime || null;
    const fcp = (paints.find(p=>p.name==='first-contentful-paint') || {}).startTime || null;
    if (firstPaint) keyMetrics.unshift({label:'First Paint', value:firstPaint});
    if (fcp) keyMetrics.unshift({label:'First Contentful Paint', value:fcp});

    // Build html summary with tips
    const tipsFor = (k, v) => {
      if (v === null || v === undefined || isNaN(v)) return 'No data';
      const n = Number(v);
      if (k.includes('DNS')) return n > 100 ? 'High DNS latency — consider DNS/CDN, or check upstream DNS' : 'DNS latency OK';
      if (k.includes('TCP')) return n > 100 ? 'Slow TCP handshake — network/connectivity issue or long RTT' : 'TCP latency OK';
      if (k.includes('TLS')) return n > 100 ? 'Slow TLS — check certificate negotiation or server CPU' : 'TLS OK';
      if (k.includes('TTFB')) return n > 200 ? 'High TTFB — server-side slowdown or cold start' : 'TTFB OK';
      if (k.includes('Paint') || k.includes('Contentful')) return n > 1000 ? 'Slow rendering — heavy JS/CSS or main-thread work' : 'Rendering time OK';
      if (k.includes('Total')) return n > 5000 ? 'Page load is slow — many resources or heavy scripts' : 'Load time reasonable';
      return '';
    };

    let html = '<div><strong>Connection:</strong> ' + (conn ? `${conn.effectiveType || 'n/a'} · ${conn.downlink || 'n/a'}Mbps · RTT ${conn.rtt || 'n/a'}ms` : 'Not available') + '</div>';
    html += '<div style="margin-top:10px"><strong>Key Performance Metrics</strong></div>';
    html += '<div style="margin-top:8px">';
    keyMetrics.forEach(km => {
      const numeric = (typeof km.value === 'number') ? km.value : (km.value && !isNaN(Number(km.value)) ? Number(km.value) : NaN);
      const display = (km.value === null || km.value === undefined || isNaN(numeric)) ? 'n/a' : (numeric.toFixed ? numeric.toFixed(2) + ' ms' : km.value);
      html += `<div class="metric-key"><div class="label">${km.label}</div><div class="value">${display}</div><div class="tip">${tipsFor(km.label, numeric)}</div></div>`;
    });
    html += '</div>';

    html += `<div style="margin-top:10px"><strong>Resources:</strong> ${totalResources} · Total Transfer: ${totalTransfer} bytes · Largest Resource: ${largestResource && largestResource.name ? largestResource.name.split('/').slice(-1)[0] + ' (' + (largestResource.transferSize || 0) + ' bytes)' : 'n/a'}</div>`;

    // Toggle to show full resource table
    html += '<div><button id="btnShowAll" class="btn-toggle-resources">Show full resource list</button></div>';

    metricsResultEl.innerHTML = html;

    // set up the full resource view when user clicks
    document.getElementById('btnShowAll').addEventListener('click', () => {
      const maxRows = 2000;
      let t = '<div style="margin-top:12px"><strong>Resources (full):</strong></div>';
      t += '<div style="overflow:auto;margin-top:8px"><table class="metrics-table"><thead><tr><th>Name</th><th>Type</th><th>Duration (ms)</th><th>Transfer</th><th>Encoded</th><th>Decoded</th></tr></thead><tbody>';
      for (let i = 0; i < Math.min(resources.length, maxRows); i++) {
        const r = resources[i];
        t += `<tr><td style="max-width:520px;word-break:break-all">${r.name}</td><td>${r.initiatorType}</td><td>${r.duration.toFixed(2)}</td><td>${r.transferSize}</td><td>${r.encodedBodySize}</td><td>${r.decodedBodySize}</td></tr>`;
      }
      t += '</tbody></table></div>';
      metricsResultEl.insertAdjacentHTML('beforeend', t);
      document.getElementById('btnShowAll').disabled = true;
      document.getElementById('btnShowAll').innerText = 'Full list appended';
    });
  } catch (err) {
    document.getElementById('metricsResult').innerText = 'Error collecting metrics: ' + err.message;
    console.error('collectNetworkMetrics error', err);
  }

}

function updateWebVitalsDisplay(vitals) {
  document.querySelector('#lcp-metric .metric-value').textContent = 
    `${vitals.lcp?.toFixed(2)}ms`;
  document.querySelector('#fid-metric .metric-value').textContent = 
    `${vitals.fid?.toFixed(2)}ms`;
  document.querySelector('#cls-metric .metric-value').textContent = 
    vitals.cls?.toFixed(3);
}

function updateBandwidthDisplay(connectionInfo, bandwidthUsage) {
  const statsElement = document.getElementById('bandwidth-stats');
  const qualityElement = document.getElementById('connection-quality');
  
  statsElement.innerHTML = `
    <p>Total Transfer: ${(bandwidthUsage / 1024 / 1024).toFixed(2)} MB</p>
  `;
  
  qualityElement.innerHTML = `
    <p>Connection Type: ${connectionInfo.effectiveType}</p>
    <p>Downlink: ${connectionInfo.downlink} Mbps</p>
    <p>RTT: ${connectionInfo.rtt}ms</p>
  `;
}

// Wire up collect button
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('collectMetrics');
  if (btn) btn.addEventListener('click', collectNetworkMetrics);
  const ref = document.getElementById('refreshInfo');
  if (ref) ref.addEventListener('click', showNetworkInfo);
});

// Diagnostics button logic (ping google.com or allow user custom input)
document.getElementById('runDiag').onclick = async () => {
  const input = document.getElementById('diagUrl');
  const endpoint = input && input.value ? input.value : "https://www.google.com";
  const summaryEl = document.getElementById('diagSummary');
  const resultEl = document.getElementById('diagResult');
  summaryEl.innerText = 'Running diagnostics...';
  resultEl.innerText = '';
  const t0 = performance.now();
  let status, respSize = null;
  try {
    const resp = await fetch(endpoint, { cache: 'no-store' });
    status = resp.status;
    try { const blob = await resp.clone().blob(); respSize = blob.size; } catch {}
  } catch (e) {
    status = 'error';
  }
  const t1 = performance.now();

  // enrich with IP/connection/server info
  const publicIp = await getPublicIp().catch(()=> 'Unavailable');
  const serverIp = await getServerIp(new URL(endpoint).hostname).catch(()=> 'Unavailable');
  const conn = (navigator && navigator.connection) ? navigator.connection : null;

  // Build human-friendly summary with quick tips
  const timeMs = (t1 - t0).toFixed(2);
  let summary = `<strong>Endpoint:</strong> ${endpoint} · <strong>Status:</strong> ${status} · <strong>Fetch Time:</strong> ${timeMs} ms`;
  if (respSize !== null) summary += ` · <strong>Payload:</strong> ${respSize} bytes`;
  summary += `<br><strong>Your Public IP:</strong> ${publicIp} · <strong>Server IP:</strong> ${serverIp}`;
  if (conn) summary += `<br><strong>Connection:</strong> ${conn.effectiveType || 'n/a'} · RTT: ${conn.rtt || 'n/a'}ms · Downlink: ${conn.downlink || 'n/a'}Mbps`;

  // suggestions
  const suggestions = [];
  if (status === 'error') suggestions.push('Fetch failed — target may be blocked, CORS blocked, or network offline.');
  if (Number(timeMs) > 1000) suggestions.push('High fetch time — server or network slow; try from another network or check server logs.');
  if (conn && conn.effectiveType && conn.effectiveType.includes('2g')) suggestions.push('Slow network type detected — results may be degraded on mobile/slow networks.');

  summaryEl.innerHTML = summary + (suggestions.length ? `<div style="margin-top:8px"><strong>Quick Tips:</strong><ul>${suggestions.map(s=>`<li>${s}</li>`).join('')}</ul></div>` : '');

  resultEl.innerHTML = `<pre style="white-space:pre-wrap">Full diagnostic details:\nFetch duration: ${timeMs} ms\nStatus: ${status}\nPublic IP: ${publicIp}\nServer IP: ${serverIp}\nConnection: ${conn ? JSON.stringify({effectiveType:conn.effectiveType,downlink:conn.downlink,rtt:conn.rtt,saveData:conn.saveData}) : 'n/a'}</pre>`;
};
