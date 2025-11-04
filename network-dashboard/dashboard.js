// Import modules
import { webVitalsCollector } from './modules/web-vitals.js';
import { bandwidthMonitor } from './modules/bandwidth-monitor.js';

// Cache DOM elements
const DOM = {
  metricsResult: null,
  networkDetails: null,
  lcpMetric: null,
  fidMetric: null,
  clsMetric: null,
  inpMetric: null,
  bandwidthStats: null,
  connectionQuality: null,
  init() {
    this.metricsResult = document.getElementById('metricsResult');
    this.networkDetails = document.getElementById('network-details');
    this.lcpMetric = document.querySelector('#lcp-metric .metric-value');
    this.fidMetric = document.querySelector('#fid-metric .metric-value');
    this.clsMetric = document.querySelector('#cls-metric .metric-value');
    this.inpMetric = document.querySelector('#inp-metric .metric-value');
    this.bandwidthStats = document.getElementById('bandwidth-stats');
    this.connectionQuality = document.getElementById('connection-quality');
  }
};

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Helper functions with proper error handling
async function getPublicIp() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.ip;
  } catch (error) {
    console.error('Failed to fetch public IP:', error);
    if (error.name === 'AbortError') return 'Timeout';
    return 'Unavailable';
  }
}

async function getServerIp(domain) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://dns.google/resolve?name=${domain}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) {
      const answer = data.Answer.find(a => a.type === 1);
      return answer ? answer.data : 'Not found';
    }
    return 'Not found';
  } catch (error) {
    console.error('Failed to resolve server IP:', error);
    if (error.name === 'AbortError') return 'Timeout';
    return 'Unavailable';
  }
}

// Show network info (using current site, e.g., google.com fallback)
async function showNetworkInfo() {
  if (!DOM.networkDetails) return;
  
  DOM.networkDetails.innerHTML = '<div class="loading">Loading network info...</div>';
  
  let domain = "www.google.com";
  let errorMessage = null;
  
  try {
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
    console.warn('Could not get tab info:', e);
    errorMessage = 'Could not access tab information. Using fallback domain.';
  }

  const publicIp = await getPublicIp();
  const serverIp = await getServerIp(domain);
  
  let html = '';
  if (errorMessage) {
    html += `<div class="error-message">${errorMessage}</div>`;
  }
  html += `
    <strong>Your Public IP:</strong> ${publicIp}<br>
    <strong>Current Domain:</strong> ${domain}<br>
    <strong>Server IP:</strong> ${serverIp}<br>
  `;
  
  DOM.networkDetails.innerHTML = html;
}

// Initialize after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  DOM.init();
  showNetworkInfo();
});

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
  if (!DOM.metricsResult) return;
  
  DOM.metricsResult.innerHTML = '<div class="loading">Collecting metrics...</div>';
  
  try {
    // Determine tab id: prefer passed value from background, else query active tab
    let tabId = getPassedTabId();
    if (!tabId) {
      const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      tabId = tab && tab.id;
    }
    
    if (!tabId) {
      throw new Error('NO_TAB', { cause: 'Could not identify an active tab. Please click the extension icon from the page you want to analyze.' });
    }

    // Check if we can access the tab
    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(tabId);
      if (tabInfo.url && (tabInfo.url.startsWith('chrome://') || tabInfo.url.startsWith('chrome-extension://'))) {
        throw new Error('RESTRICTED_PAGE', { cause: 'Cannot collect metrics from Chrome internal pages. Please navigate to a regular website.' });
      }
    } catch (e) {
      if (e.message === 'RESTRICTED_PAGE') throw e;
      throw new Error('TAB_ACCESS', { cause: 'Could not access tab. The tab may have been closed.' });
    }

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
    }).catch(err => {
      if (err.message.includes('Cannot access')) {
        throw new Error('PERMISSION_DENIED', { cause: 'Permission denied. Please click the extension icon from the page you want to analyze to grant access.' });
      }
      throw err;
    });

    const payload = injection && injection[0] && injection[0].result ? injection[0].result : null;
    if (!payload) {
      throw new Error('NO_DATA', { cause: 'No metrics returned. The page may not support the Performance API.' });
    }

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

    // Collect Web Vitals using the module
    const vitals = await webVitalsCollector.collectMetrics(tabId);
    updateWebVitalsDisplay(vitals);

    // Collect Bandwidth Information using the module
    const connectionInfo = await bandwidthMonitor.measureConnectionSpeed(tabId);
    const bandwidthUsage = bandwidthMonitor.calculateBandwidthUsage(resources);
    const bandwidthBreakdown = bandwidthMonitor.getBandwidthBreakdown(resources);
    updateBandwidthDisplay(connectionInfo, bandwidthUsage, bandwidthBreakdown);

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

    DOM.metricsResult.innerHTML = html;

    // set up the full resource view when user clicks - use requestAnimationFrame for better performance
    document.getElementById('btnShowAll').addEventListener('click', () => {
      const btn = document.getElementById('btnShowAll');
      btn.disabled = true;
      btn.innerText = 'Loading...';
      
      requestAnimationFrame(() => {
        const maxRows = 2000;
        const batchSize = 100;
        let t = '<div style="margin-top:12px"><strong>Resources (full):</strong></div>';
        t += '<div style="overflow:auto;margin-top:8px"><table class="metrics-table"><thead><tr><th>Name</th><th>Type</th><th>Duration (ms)</th><th>Transfer</th><th>Encoded</th><th>Decoded</th></tr></thead><tbody id="resource-tbody">';
        t += '</tbody></table></div>';
        DOM.metricsResult.insertAdjacentHTML('beforeend', t);
        
        const tbody = document.getElementById('resource-tbody');
        let currentIndex = 0;
        
        function renderBatch() {
          const fragment = document.createDocumentFragment();
          const end = Math.min(currentIndex + batchSize, resources.length, maxRows);
          
          for (let i = currentIndex; i < end; i++) {
            const r = resources[i];
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="max-width:520px;word-break:break-all">${r.name}</td><td>${r.initiatorType}</td><td>${r.duration.toFixed(2)}</td><td>${r.transferSize}</td><td>${r.encodedBodySize}</td><td>${r.decodedBodySize}</td>`;
            fragment.appendChild(tr);
          }
          
          tbody.appendChild(fragment);
          currentIndex = end;
          
          if (currentIndex < Math.min(resources.length, maxRows)) {
            requestAnimationFrame(renderBatch);
          } else {
            btn.innerText = 'Full list loaded';
          }
        }
        
        renderBatch();
      });
    });
  } catch (err) {
    console.error('collectNetworkMetrics error', err);
    
    let userMessage = 'Error collecting metrics: ';
    if (err.message === 'NO_TAB' || err.message === 'RESTRICTED_PAGE' || err.message === 'TAB_ACCESS' || err.message === 'PERMISSION_DENIED' || err.message === 'NO_DATA') {
      userMessage += err.cause || err.message;
    } else {
      userMessage += 'An unexpected error occurred. Check the console for details.';
    }
    
    DOM.metricsResult.innerHTML = `<div class="error-message">${userMessage}</div>`;
  }
}

// Helper function for Web Vitals display with thresholds

function updateWebVitalsDisplay(vitals) {
  if (!DOM.lcpMetric || !DOM.fidMetric || !DOM.clsMetric || !DOM.inpMetric) return;
  
  // LCP thresholds: good < 2500ms, needs improvement < 4000ms, poor >= 4000ms
  const lcpValue = vitals.lcp !== null ? vitals.lcp.toFixed(0) : null;
  const lcpClass = vitals.lcp !== null ? (vitals.lcp < 2500 ? 'good' : vitals.lcp < 4000 ? 'needs-improvement' : 'poor') : '';
  DOM.lcpMetric.textContent = lcpValue ? `${lcpValue}ms` : 'N/A';
  DOM.lcpMetric.className = `metric-value ${lcpClass}`;
  
  // FID thresholds: good < 100ms, needs improvement < 300ms, poor >= 300ms
  const fidValue = vitals.fid !== null ? vitals.fid.toFixed(0) : null;
  const fidClass = vitals.fid !== null ? (vitals.fid < 100 ? 'good' : vitals.fid < 300 ? 'needs-improvement' : 'poor') : '';
  DOM.fidMetric.textContent = fidValue ? `${fidValue}ms` : 'N/A';
  DOM.fidMetric.className = `metric-value ${fidClass}`;
  
  // CLS thresholds: good < 0.1, needs improvement < 0.25, poor >= 0.25
  const clsValue = vitals.cls !== null ? vitals.cls.toFixed(3) : null;
  const clsClass = vitals.cls !== null ? (vitals.cls < 0.1 ? 'good' : vitals.cls < 0.25 ? 'needs-improvement' : 'poor') : '';
  DOM.clsMetric.textContent = clsValue || 'N/A';
  DOM.clsMetric.className = `metric-value ${clsClass}`;
  
  // INP thresholds: good < 200ms, needs improvement < 500ms, poor >= 500ms
  const inpValue = vitals.inp !== null ? vitals.inp.toFixed(0) : null;
  const inpClass = vitals.inp !== null ? (vitals.inp < 200 ? 'good' : vitals.inp < 500 ? 'needs-improvement' : 'poor') : '';
  DOM.inpMetric.textContent = inpValue ? `${inpValue}ms` : 'N/A';
  DOM.inpMetric.className = `metric-value ${inpClass}`;
}

function updateBandwidthDisplay(connectionInfo, bandwidthUsage, breakdown) {
  if (!DOM.bandwidthStats || !DOM.connectionQuality) return;
  
  const totalMB = (bandwidthUsage / 1024 / 1024).toFixed(2);
  
  let breakdownHtml = '<div class="bandwidth-breakdown">';
  if (breakdown && Object.keys(breakdown).length > 0) {
    breakdownHtml += '<h4>By Resource Type:</h4>';
    Object.entries(breakdown).forEach(([type, data]) => {
      const sizeMB = (data.size / 1024 / 1024).toFixed(2);
      const percentage = ((data.size / bandwidthUsage) * 100).toFixed(1);
      breakdownHtml += `
        <div class="breakdown-item">
          <span class="breakdown-type">${type}</span>
          <span class="breakdown-count">${data.count} files</span>
          <span class="breakdown-size">${sizeMB} MB (${percentage}%)</span>
        </div>
      `;
    });
  }
  breakdownHtml += '</div>';
  
  DOM.bandwidthStats.innerHTML = `
    <p><strong>Total Transfer:</strong> ${totalMB} MB</p>
    ${breakdownHtml}
  `;
  
  const qualityClass = connectionInfo.effectiveType === '4g' ? 'good' : 
                       connectionInfo.effectiveType === '3g' ? 'needs-improvement' : 
                       connectionInfo.effectiveType === 'slow-2g' || connectionInfo.effectiveType === '2g' ? 'poor' : '';
  
  DOM.connectionQuality.innerHTML = `
    <p><strong>Connection Type:</strong> <span class="connection-type ${qualityClass}">${connectionInfo.effectiveType}</span></p>
    <p><strong>Downlink:</strong> ${connectionInfo.downlink} Mbps</p>
    <p><strong>RTT:</strong> ${connectionInfo.rtt}ms</p>
    ${connectionInfo.saveData ? '<p class="save-data-warning">⚠️ Data Saver mode is enabled</p>' : ''}
  `;
}

// Wire up collect button with debouncing
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('collectMetrics');
  if (btn) btn.addEventListener('click', debounce(collectNetworkMetrics, 500));
  const ref = document.getElementById('refreshInfo');
  if (ref) ref.addEventListener('click', debounce(showNetworkInfo, 500));
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
