// Import modules
import { webVitalsCollector } from './modules/web-vitals.js';
import { bandwidthMonitor } from './modules/bandwidth-monitor.js';
import { performanceScoreCalculator } from './modules/performance-score.js';
import { waterfallChart } from './modules/waterfall.js';
import { thirdPartyAnalyzer } from './modules/third-party-analyzer.js';
import { recommendationsEngine } from './modules/recommendations.js';
import { imageOptimizer } from './modules/image-optimizer.js';
import { historicalTracker } from './modules/historical-tracker.js';
import { apiMonitor } from './modules/api-monitor.js';

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
  quickWinsList: null,
  init() {
    this.metricsResult = document.getElementById('metricsResult');
    this.networkDetails = document.getElementById('network-details');
    this.lcpMetric = document.querySelector('#lcp-metric .metric-value');
    this.fidMetric = document.querySelector('#fid-metric .metric-value');
    this.clsMetric = document.querySelector('#cls-metric .metric-value');
    this.inpMetric = document.querySelector('#inp-metric .metric-value');
    this.bandwidthStats = document.getElementById('bandwidth-stats');
    this.connectionQuality = document.getElementById('connection-quality');
    this.quickWinsList = document.getElementById('quick-wins-list');
  }
};

// In-memory snapshot of last run for exports
let lastSnapshotData = null;

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

// Tab switching - will be initialized on DOMContentLoaded
function initTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

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

    // Paint metrics
    const paints = performance.getEntriesByType ? performance.getEntriesByType('paint') : [];
    const firstPaint = (paints.find(p=>p.name==='first-paint') || {}).startTime || null;
    const fcp = (paints.find(p=>p.name==='first-contentful-paint') || {}).startTime || null;

    // Collect Web Vitals using the module
    const vitals = await webVitalsCollector.collectMetrics(tabId);
    updateWebVitalsDisplay(vitals);

    // Calculate performance score
    const performanceMetrics = {
      lcp: vitals.lcp,
      inp: vitals.inp,
      cls: vitals.cls,
      fcp: fcp,
      ttfb: requestTime,
      tbt: null // We'll calculate this if we add long tasks tracking
    };
    
    console.log('Performance Metrics:', performanceMetrics);
    const scoreData = performanceScoreCalculator.calculateScore(performanceMetrics);
    console.log('Score Data:', scoreData);
    updatePerformanceScore(scoreData);

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

    // Render waterfall chart
    const resourcesWithStartTime = resources.map(r => ({
      ...r,
      startTime: r.fetchStart || r.startTime || 0
    }));
    waterfallChart.render(resourcesWithStartTime, 'waterfall-chart');
    document.getElementById('waterfall-container').style.display = 'block';

    // Analyze third-party resources
    let currentDomain = 'unknown';
    try {
      const params = new URLSearchParams(location.search);
      const passedTabId = params.get('tabId');
      if (passedTabId) {
        const tabId = parseInt(passedTabId, 10);
        const t = await chrome.tabs.get(tabId);
        currentDomain = t && t.url ? new URL(t.url).hostname : currentDomain;
      }
    } catch (e) {
      console.warn('Could not get current domain:', e);
    }
    
    const thirdPartyAnalysis = thirdPartyAnalyzer.analyze(resources, currentDomain);
    thirdPartyAnalyzer.render(thirdPartyAnalysis, 'third-party-analysis');
    document.getElementById('third-party-container').style.display = 'block';

    // Generate recommendations
    const recommendations = recommendationsEngine.generateRecommendations(
      performanceMetrics,
      resources,
      nav
    );
    renderRecommendations(recommendations);

    // Analyze images
    const imageAnalysis = imageOptimizer.analyzeImages(resources);
    renderImageOptimization(imageAnalysis);

    // Analyze API calls
    const apiAnalysis = apiMonitor.analyzeApiCalls(resources);
    renderApiMonitor(apiAnalysis);

    // Quick wins from current run
    const quickWins = buildQuickWins(performanceMetrics, resources, thirdPartyAnalysis, imageAnalysis, apiAnalysis);
    renderQuickWins(quickWins);

    // Save to history
    const historyData = {
      lcp: vitals.lcp,
      inp: vitals.inp,
      fid: vitals.fid,
      cls: vitals.cls,
      fcp: fcp,
      ttfb: requestTime,
      performanceScore: scoreData.overall,
      totalResources: resources.length,
      totalSize: totalTransfer,
      thirdPartyCount: thirdPartyAnalysis.thirdPartyCount,
      thirdPartySize: thirdPartyAnalysis.totalThirdPartySize
    };
    historicalTracker.saveMetrics(currentDomain, historyData);

    // Cache snapshot data for export/share
    lastSnapshotData = buildSnapshotData({
      domain: currentDomain,
      performanceScore: scoreData.overall,
      vitals,
      keyMetrics,
      totalResources,
      totalTransfer,
      largestResource,
      connectionInfo,
      bandwidthUsage,
      thirdParty: {
        count: thirdPartyAnalysis.thirdPartyCount,
        size: thirdPartyAnalysis.totalThirdPartySize
      },
      quickWins
    });
    
    // Show historical stats
    const stats = historicalTracker.getStats(currentDomain);
    if (stats) {
      renderHistoricalStats(stats);
    }

    // Show export options
    document.getElementById('export-container').style.display = 'block';

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
  const lcpPercent = vitals.lcp !== null ? Math.min((vitals.lcp / 4000) * 100, 100) : 0;
  DOM.lcpMetric.textContent = lcpValue ? `${lcpValue}ms` : 'N/A';
  DOM.lcpMetric.className = `metric-value ${lcpClass}`;
  updateProgressBar('lcp-metric', lcpPercent, lcpClass);
  setBadge('lcp-metric', lcpClass);
  
  // FID thresholds: good < 100ms, needs improvement < 300ms, poor >= 300ms
  const fidValue = vitals.fid !== null ? vitals.fid.toFixed(0) : null;
  const fidClass = vitals.fid !== null ? (vitals.fid < 100 ? 'good' : vitals.fid < 300 ? 'needs-improvement' : 'poor') : '';
  const fidPercent = vitals.fid !== null ? Math.min((vitals.fid / 300) * 100, 100) : 0;
  DOM.fidMetric.textContent = fidValue ? `${fidValue}ms` : 'N/A';
  DOM.fidMetric.className = `metric-value ${fidClass}`;
  updateProgressBar('fid-metric', fidPercent, fidClass);
  setBadge('fid-metric', fidClass);
  
  // CLS thresholds: good < 0.1, needs improvement < 0.25, poor >= 0.25
  const clsValue = vitals.cls !== null ? vitals.cls.toFixed(3) : null;
  const clsClass = vitals.cls !== null ? (vitals.cls < 0.1 ? 'good' : vitals.cls < 0.25 ? 'needs-improvement' : 'poor') : '';
  const clsPercent = vitals.cls !== null ? Math.min((vitals.cls / 0.25) * 100, 100) : 0;
  DOM.clsMetric.textContent = clsValue || 'N/A';
  DOM.clsMetric.className = `metric-value ${clsClass}`;
  updateProgressBar('cls-metric', clsPercent, clsClass);
  setBadge('cls-metric', clsClass);
  
  // INP thresholds: good < 200ms, needs improvement < 500ms, poor >= 500ms
  const inpValue = vitals.inp !== null ? vitals.inp.toFixed(0) : null;
  const inpClass = vitals.inp !== null ? (vitals.inp < 200 ? 'good' : vitals.inp < 500 ? 'needs-improvement' : 'poor') : '';
  const inpPercent = vitals.inp !== null ? Math.min((vitals.inp / 500) * 100, 100) : 0;
  DOM.inpMetric.textContent = inpValue ? `${inpValue}ms` : 'N/A';
  DOM.inpMetric.className = `metric-value ${inpClass}`;
  updateProgressBar('inp-metric', inpPercent, inpClass);
  setBadge('inp-metric', inpClass);
}

function updateProgressBar(metricId, percent, category) {
  const metricItem = document.getElementById(metricId);
  if (!metricItem) return;
  
  const progressBar = metricItem.querySelector('.progress-bar');
  if (!progressBar) return;
  
  progressBar.style.width = `${percent}%`;
  progressBar.className = `progress-bar ${category}`;
}

function setBadge(metricId, category) {
  const metricItem = document.getElementById(metricId);
  if (!metricItem) return;
  const badge = metricItem.querySelector('.metric-badge');
  if (!badge) return;
  const label = category === 'good' ? 'Pass' : category === 'needs-improvement' ? 'Needs improvement' : category === 'poor' ? 'Fail' : '--';
  badge.textContent = label;
  badge.className = `metric-badge ${category || ''}`;
}

function classifyStatus(value, thresholds) {
  if (value === null || value === undefined || isNaN(value)) return {label: 'unknown', class: ''};
  if (value < thresholds.good) return {label: 'good', class: 'good'};
  if (value < thresholds.poor) return {label: 'needs-improvement', class: 'needs-improvement'};
  return {label: 'poor', class: 'poor'};
}

function updatePerformanceScore(scoreData) {
  const scoreCard = document.getElementById('performance-score-card');
  if (!scoreCard) return;

  // Don't show if score is invalid
  if (!scoreData || isNaN(scoreData.overall) || scoreData.overall === 0) {
    scoreCard.style.display = 'none';
    return;
  }

  scoreCard.style.display = 'flex';
  
  const scoreValue = scoreCard.querySelector('.score-value');
  const scoreProgress = scoreCard.querySelector('.score-progress');
  const scoreDescription = scoreCard.querySelector('.score-description');
  
  if (scoreValue) scoreValue.textContent = scoreData.overall;
  
  // Update circle progress
  if (scoreProgress) {
    const circumference = 2 * Math.PI * 54;
    const score = Math.max(0, Math.min(100, scoreData.overall)); // Clamp between 0-100
    const offset = circumference - (score / 100) * circumference;
    scoreProgress.style.strokeDasharray = `${circumference} ${circumference}`;
    scoreProgress.style.strokeDashoffset = offset;
    
    // Color based on category
    const colors = {
      good: '#0cce6b',
      'needs-improvement': '#ffa400',
      poor: '#ff4e42',
      unknown: '#61dafb'
    };
    scoreProgress.style.stroke = colors[scoreData.category] || '#61dafb';
  }
  
  if (scoreDescription) {
    const categoryText = {
      good: 'Excellent performance! 🎉',
      'needs-improvement': 'Room for improvement',
      poor: 'Needs attention',
      unknown: 'Limited data available'
    };
    scoreDescription.textContent = categoryText[scoreData.category] || 'Based on Core Web Vitals and key metrics';
  }
}

function renderRecommendations(recommendations) {
  const panel = document.getElementById('recommendations-panel');
  const list = document.getElementById('recommendations-list');
  
  if (!panel || !list) return;
  
  if (recommendations.length === 0) {
    list.innerHTML = '<div class="no-recommendations">✅ No major issues detected! Your site is performing well.</div>';
    panel.style.display = 'block';
    return;
  }
  
  let html = '';
  recommendations.forEach(rec => {
    const priorityIcons = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    
    html += `<div class="recommendation-item priority-${rec.priority}">`;
    html += `<div class="rec-header">`;
    html += `<span class="rec-priority">${priorityIcons[rec.priority]} ${rec.priority.toUpperCase()}</span>`;
    html += `<span class="rec-category">${rec.category}</span>`;
    html += `</div>`;
    html += `<div class="rec-issue">${rec.issue}</div>`;
    html += `<div class="rec-suggestions">`;
    html += `<strong>Suggestions:</strong>`;
    html += `<ul>`;
    rec.suggestions.forEach(suggestion => {
      html += `<li>${suggestion}</li>`;
    });
    html += `</ul>`;
    html += `</div>`;
    html += `</div>`;
  });
  
  list.innerHTML = html;
  panel.style.display = 'block';
}

function renderImageOptimization(analysis) {
  const container = document.getElementById('image-optimization-analysis');
  if (!container) return;

  let html = '<div class="image-optimization">';
  
  // Summary
  html += '<div class="image-summary">';
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Total Images:</span>`;
  html += `<span class="stat-value">${analysis.totalImages}</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Images with Issues:</span>`;
  html += `<span class="stat-value ${analysis.imagesWithIssues > 0 ? 'warning' : 'good'}">${analysis.imagesWithIssues}</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Potential Savings:</span>`;
  html += `<span class="stat-value">${(analysis.totalPotentialSavings / 1024 / 1024).toFixed(2)} MB</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Optimization Score:</span>`;
  html += `<span class="stat-value score-${analysis.summary.optimizationScore >= 80 ? 'good' : analysis.summary.optimizationScore >= 60 ? 'medium' : 'poor'}">${analysis.summary.optimizationScore}/100</span>`;
  html += `</div>`;
  html += '</div>';

  // Issues list
  if (analysis.issues.length > 0) {
    html += '<div class="image-issues">';
    html += '<h4>Images Needing Optimization:</h4>';
    
    analysis.issues.slice(0, 10).forEach(img => {
      const fileName = img.url.split('/').pop().substring(0, 50);
      html += '<div class="image-issue-item">';
      html += `<div class="image-name" title="${img.url}">${fileName}</div>`;
      html += `<div class="image-size">${(img.size / 1024).toFixed(0)} KB → Save ${(img.potentialSavings / 1024).toFixed(0)} KB</div>`;
      html += '<ul class="issue-list">';
      img.issues.forEach(issue => {
        const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        html += `<li>${icon} ${issue.message} - ${issue.recommendation}</li>`;
      });
      html += '</ul>';
      html += '</div>';
    });

    if (analysis.issues.length > 10) {
      html += `<div class="more-issues">+ ${analysis.issues.length - 10} more images with issues</div>`;
    }

    html += '</div>';
  } else {
    html += '<div class="no-issues">✅ All images are well optimized!</div>';
  }

  html += '</div>';
  
  container.innerHTML = html;
  document.getElementById('image-optimization-container').style.display = 'block';
}

function renderApiMonitor(analysis) {
  const container = document.getElementById('api-monitor-analysis');
  if (!container) return;

  let html = '<div class="api-monitor">';
  
  // Summary
  const summary = apiMonitor.generateSummary(analysis);
  html += '<div class="api-summary">';
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Total API Calls:</span>`;
  html += `<span class="stat-value">${summary.totalCalls}</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Total Duration:</span>`;
  html += `<span class="stat-value">${summary.totalDuration}ms</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Avg Duration:</span>`;
  html += `<span class="stat-value">${summary.avgDuration}ms</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Total Size:</span>`;
  html += `<span class="stat-value">${summary.totalSize} MB</span>`;
  html += `</div>`;
  html += `<div class="summary-stat">`;
  html += `<span class="stat-label">Success Rate:</span>`;
  html += `<span class="stat-value ${summary.successRate >= 90 ? 'good' : 'warning'}">${summary.successRate}%</span>`;
  html += `</div>`;
  html += '</div>';

  if (analysis.totalCalls === 0) {
    html += '<div class="no-api-calls">No API calls detected on this page</div>';
    html += '</div>';
    container.innerHTML = html;
    document.getElementById('api-monitor-container').style.display = 'block';
    return;
  }

  // Issues
  if (analysis.issues.length > 0) {
    html += '<div class="api-issues">';
    html += '<h4>⚠️ Issues Detected:</h4>';
    
    analysis.issues.forEach(issue => {
      const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
      html += `<div class="api-issue-item severity-${issue.severity}">`;
      html += `<div class="issue-header">${icon} ${issue.message}</div>`;
      html += `<div class="issue-recommendation">💡 ${issue.recommendation}</div>`;
      html += `</div>`;
    });
    
    html += '</div>';
  }

  // Top API calls by duration
  html += '<div class="api-calls-list">';
  html += '<h4>Slowest API Calls:</h4>';
  
  analysis.calls.slice(0, 10).forEach(call => {
    const durationClass = call.duration > 1000 ? 'slow' : call.duration > 500 ? 'medium' : 'fast';
    html += '<div class="api-call-item">';
    html += `<div class="call-url" title="${call.url}">${call.path}</div>`;
    html += `<div class="call-details">`;
    html += `<span class="call-domain">${call.domain}</span>`;
    html += `<span class="call-duration ${durationClass}">${call.duration.toFixed(0)}ms</span>`;
    html += `<span class="call-size">${(call.size / 1024).toFixed(1)} KB</span>`;
    html += `<span class="call-status status-${call.status}">${call.status}</span>`;
    html += `</div>`;
    html += '</div>';
  });

  if (analysis.calls.length > 10) {
    html += `<div class="more-calls">+ ${analysis.calls.length - 10} more API calls</div>`;
  }

  html += '</div>';

  // By Domain
  if (analysis.byDomain.length > 0) {
    html += '<div class="api-by-domain">';
    html += '<h4>API Calls by Domain:</h4>';
    
    analysis.byDomain.slice(0, 5).forEach(domain => {
      html += '<div class="domain-api-item">';
      html += `<div class="domain-name">${domain.domain}</div>`;
      html += `<div class="domain-api-stats">`;
      html += `<span>${domain.count} calls</span>`;
      html += `<span>${domain.avgDuration.toFixed(0)}ms avg</span>`;
      html += `<span>${(domain.totalSize / 1024).toFixed(1)} KB</span>`;
      html += `</div>`;
      html += '</div>';
    });

    if (analysis.byDomain.length > 5) {
      html += `<div class="more-domains">+ ${analysis.byDomain.length - 5} more domains</div>`;
    }

    html += '</div>';
  }

  html += '</div>';
  
  container.innerHTML = html;
  document.getElementById('api-monitor-container').style.display = 'block';
}

function renderHistoricalStats(stats) {
  const container = document.getElementById('historical-stats');
  if (!container) return;

  let html = '<div class="historical-stats">';
  
  html += `<div class="stats-header">`;
  html += `<span>Based on ${stats.totalMeasurements} measurement${stats.totalMeasurements > 1 ? 's' : ''}</span>`;
  html += `</div>`;

  html += '<div class="stats-grid">';
  
  const metrics = [
    { key: 'performanceScore', label: 'Performance Score', unit: '' },
    { key: 'lcp', label: 'LCP', unit: 'ms' },
    { key: 'inp', label: 'INP', unit: 'ms' },
    { key: 'cls', label: 'CLS', unit: '' },
    { key: 'ttfb', label: 'TTFB', unit: 'ms' }
  ];

  metrics.forEach(metric => {
    if (stats.stats[metric.key]) {
      const data = stats.stats[metric.key];
      const trendIcon = data.trend === 'improving' ? '📈' : data.trend === 'degrading' ? '📉' : '➡️';
      const trendClass = data.trend === 'improving' ? 'good' : data.trend === 'degrading' ? 'poor' : '';
      
      html += '<div class="stat-card">';
      html += `<div class="stat-label">${metric.label}</div>`;
      html += `<div class="stat-current">${data.current.toFixed(metric.unit === 'ms' ? 0 : 3)}${metric.unit}</div>`;
      html += `<div class="stat-details">`;
      html += `<span>Avg: ${data.average.toFixed(metric.unit === 'ms' ? 0 : 3)}${metric.unit}</span>`;
      html += `<span>Min: ${data.min.toFixed(metric.unit === 'ms' ? 0 : 3)}${metric.unit}</span>`;
      html += `<span>Max: ${data.max.toFixed(metric.unit === 'ms' ? 0 : 3)}${metric.unit}</span>`;
      html += `</div>`;
      html += `<div class="stat-trend ${trendClass}">${trendIcon} ${data.trend}</div>`;
      html += '</div>';
    }
  });

  html += '</div>';
  html += '</div>';
  
  container.innerHTML = html;
  document.getElementById('historical-tracking-container').style.display = 'block';
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

function buildQuickWins(performanceMetrics, resources, thirdPartyAnalysis, imageAnalysis, apiAnalysis) {
  const wins = [];

  if (performanceMetrics.lcp && performanceMetrics.lcp > 4000) {
    wins.push({
      title: 'Improve LCP (hero render)',
      body: 'Compress/AVIF hero media, reduce render-blocking CSS/JS, improve server TTFB.',
      meta: `LCP: ${performanceMetrics.lcp.toFixed(0)} ms`
    });
  }

  if (performanceMetrics.inp && performanceMetrics.inp > 500) {
    wins.push({
      title: 'Lower Interaction to Next Paint (INP)',
      body: 'Trim main-thread work: defer non-critical JS, split bundles, avoid heavy sync handlers.',
      meta: `INP: ${performanceMetrics.inp.toFixed(0)} ms`
    });
  }

  if (resources && resources.length) {
    const largest = resources.reduce((best, r) => (r.transferSize || 0) > (best.transferSize || 0) ? r : best, resources[0]);
    if (largest && largest.transferSize > 300000) {
      wins.push({
        title: 'Shrink largest asset',
        body: 'Compress/split the largest asset; consider code-splitting or lazy-loading.',
        meta: `${largest.name.split('/').pop()} · ${(largest.transferSize/1024).toFixed(1)} KB`
      });
    }
  }

  if (thirdPartyAnalysis && thirdPartyAnalysis.totalThirdPartySize > 0) {
    wins.push({
      title: 'Optimize third-parties',
      body: 'Async/defer third-party scripts; preconnect critical 3P domains to cut DNS/TCP cost.',
      meta: `3P bytes: ${(thirdPartyAnalysis.totalThirdPartySize/1024).toFixed(1)} KB`
    });
  }

  if (apiAnalysis && apiAnalysis.slowestCall) {
    wins.push({
      title: 'Speed up API endpoint',
      body: 'Add CDN/cache headers, trim payload, and reduce server latency on the slowest call.',
      meta: `${apiAnalysis.slowestCall.url} · ${apiAnalysis.slowestCall.duration.toFixed(0)} ms`
    });
  }

  if (imageAnalysis && imageAnalysis.oversized?.length) {
    wins.push({
      title: 'Optimize large images',
      body: 'Convert to AVIF/WebP, serve responsive sizes, and lazy-load below-the-fold media.',
      meta: `${imageAnalysis.oversized.length} images flagged`
    });
  }

  return wins.slice(0, 4);
}

function renderQuickWins(wins) {
  const panel = document.getElementById('quick-wins-panel');
  if (!panel || !DOM.quickWinsList) return;
  if (!wins || !wins.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  DOM.quickWinsList.innerHTML = wins.map(win => `
    <div class="quick-win">
      <h4>${win.title}</h4>
      <div class="win-body">${win.body}</div>
      <div class="win-meta">${win.meta || ''}</div>
    </div>
  `).join('');
}

function buildSnapshotData(payload) {
  return {
    generatedAt: new Date().toISOString(),
    domain: payload.domain,
    performanceScore: payload.performanceScore,
    vitals: payload.vitals,
    keyMetrics: payload.keyMetrics,
    totals: {
      totalResources: payload.totalResources,
      totalTransfer: payload.totalTransfer,
      largestResource: payload.largestResource
    },
    connection: payload.connectionInfo,
    bandwidth: payload.bandwidthUsage,
    thirdParty: payload.thirdParty,
    quickWins: payload.quickWins
  };
}

function buildSnapshotHtml(data) {
  const style = `
    body{font-family:Arial, sans-serif; margin:24px; color:#1a1d23;}
    h1{margin:0 0 12px 0;}
    .section{margin:16px 0; padding:12px; border:1px solid #e1e4e8; border-radius:8px; background:#fff;}
    .grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;}
    .card{padding:10px; border:1px solid #e1e4e8; border-radius:6px; background:#f9fafb;}
    .badge{padding:4px 8px; border-radius:999px; font-size:12px; font-weight:700;}
    .badge.good{background:#e6f4ea; color:#146c2e;}
    .badge.needs-improvement{background:#fff4e5; color:#a45e00;}
    .badge.poor{background:#ffecef; color:#b3001b;}
    .muted{color:#555; font-size:13px;}
    ul{margin:8px 0 0 18px;}
  `;

  const vitals = data.vitals || {};
  const badge = (val, thresholds) => {
    if (val === null || val === undefined || isNaN(val)) return '<span class="badge">N/A</span>';
    if (val < thresholds.good) return '<span class="badge good">Pass</span>';
    if (val < thresholds.poor) return '<span class="badge needs-improvement">Needs improvement</span>';
    return '<span class="badge poor">Fail</span>';
  };

  const quickWinsHtml = (data.quickWins || []).map(w => `
    <div class="card"><strong>${w.title}</strong><br/><span class="muted">${w.meta||''}</span><br/>${w.body}</div>
  `).join('') || '<div class="muted">No quick wins generated.</div>';

  return `<!doctype html>
  <html><head><meta charset="utf-8"/><title>Network Snapshot</title><style>${style}</style></head><body>
  <h1>Network Snapshot</h1>
  <div class="muted">Domain: ${data.domain || 'n/a'} · Generated: ${data.generatedAt}</div>

  <div class="section">
    <h3>Performance Score</h3>
    <div class="grid">
      <div class="card"><strong>Score</strong><br/>${data.performanceScore ?? 'n/a'}</div>
      <div class="card"><strong>Total Resources</strong><br/>${data.totals.totalResources}</div>
      <div class="card"><strong>Total Transfer</strong><br/>${(data.totals.totalTransfer/1024/1024).toFixed(2)} MB</div>
    </div>
  </div>

  <div class="section">
    <h3>Core Web Vitals</h3>
    <div class="grid">
      <div class="card">LCP: ${vitals.lcp ? vitals.lcp.toFixed(0)+' ms' : 'n/a'} ${badge(vitals.lcp, {good:2500, poor:4000})}</div>
      <div class="card">INP: ${vitals.inp ? vitals.inp.toFixed(0)+' ms' : 'n/a'} ${badge(vitals.inp, {good:200, poor:500})}</div>
      <div class="card">CLS: ${vitals.cls || vitals.cls === 0 ? vitals.cls.toFixed(3) : 'n/a'} ${badge(vitals.cls, {good:0.1, poor:0.25})}</div>
      <div class="card">FID: ${vitals.fid ? vitals.fid.toFixed(0)+' ms' : 'n/a'} ${badge(vitals.fid, {good:100, poor:300})}</div>
    </div>
  </div>

  <div class="section">
    <h3>Connection & Bandwidth</h3>
    <div class="grid">
      <div class="card">Connection: ${data.connection?.effectiveType || 'n/a'}</div>
      <div class="card">Downlink: ${data.connection?.downlink || 'n/a'} Mbps</div>
      <div class="card">RTT: ${data.connection?.rtt || 'n/a'} ms</div>
      <div class="card">Total Transfer: ${(data.bandwidth?.totalBytes||0)/1024/1024.toFixed?.(2)}</div>
    </div>
  </div>

  <div class="section">
    <h3>Quick Wins</h3>
    ${quickWinsHtml}
  </div>

  <div class="section">
    <h3>Key Metrics</h3>
    <ul>
      ${(data.keyMetrics||[]).map(k => `<li><strong>${k.label}:</strong> ${k.value}</li>`).join('')}
    </ul>
  </div>

  <div class="section">
    <h3>Third-party</h3>
    <div class="grid">
      <div class="card">Count: ${data.thirdParty?.count ?? 'n/a'}</div>
      <div class="card">Bytes: ${(data.thirdParty?.size||0)/1024/1024.toFixed?.(2)}</div>
    </div>
  </div>
  </body></html>`;
}

function downloadSnapshotHtml(data) {
  const html = buildSnapshotHtml(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'network-snapshot.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copySnapshotLink(data) {
  const html = buildSnapshotHtml(data);
  const base64 = btoa(unescape(encodeURIComponent(html)));
  const dataUrl = `data:text/html;base64,${base64}`;
  try {
    await navigator.clipboard.writeText(dataUrl);
    alert('Snapshot link copied to clipboard');
  } catch (err) {
    console.error('Copy failed', err);
    alert('Copy failed; please try again');
  }
}

// Helper function to update theme icon
function updateThemeIcon(isLight) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = isLight ? '☀️' : '🌙';
  }
}

// Wire up all event listeners after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize DOM cache
  DOM.init();
  
  // Initialize tab switching
  initTabSwitching();
  
  // Wire up collect metrics button
  const btn = document.getElementById('collectMetrics');
  if (btn) btn.addEventListener('click', debounce(collectNetworkMetrics, 500));
  
  // Wire up refresh info button
  const ref = document.getElementById('refreshInfo');
  if (ref) ref.addEventListener('click', debounce(showNetworkInfo, 500));
  
  // Wire up diagnostics button
  const diagBtn = document.getElementById('runDiag');
  if (diagBtn) diagBtn.onclick = runDiagnostics;
  
  // Wire up export buttons
  const exportJsonBtn = document.getElementById('export-json');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      const url = historicalTracker.exportToJSON();
      const a = document.createElement('a');
      a.href = url;
      a.download = `network-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const exportCsvBtn = document.getElementById('export-csv');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const url = historicalTracker.exportToCSV();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `network-diagnostics-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('No data to export');
      }
    });
  }

  const exportSnapshotBtn = document.getElementById('export-snapshot');
  if (exportSnapshotBtn) {
    exportSnapshotBtn.addEventListener('click', () => {
      if (!lastSnapshotData) {
        alert('Run a scan first to generate a snapshot.');
        return;
      }
      downloadSnapshotHtml(lastSnapshotData);
    });
  }

  const copySnapshotLinkBtn = document.getElementById('copy-snapshot-link');
  if (copySnapshotLinkBtn) {
    copySnapshotLinkBtn.addEventListener('click', () => {
      if (!lastSnapshotData) {
        alert('Run a scan first to generate a snapshot.');
        return;
      }
      copySnapshotLink(lastSnapshotData);
    });
  }

  const clearHistoryBtn = document.getElementById('clear-history');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all historical data? This cannot be undone.')) {
        historicalTracker.clearHistory();
        document.getElementById('historical-tracking-container').style.display = 'none';
        alert('History cleared successfully');
      }
    });
  }

  // Wire up theme toggle
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('dashboard-theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      updateThemeIcon(true);
    }

    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-theme');
      localStorage.setItem('dashboard-theme', isLight ? 'light' : 'dark');
      updateThemeIcon(isLight);
    });
  }
  
  // Load initial network info
  showNetworkInfo();
});

// Diagnostics button logic (ping google.com or allow user custom input)
async function runDiagnostics() {
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
}
