class HistoricalTracker {
  constructor() {
    this.storageKey = 'network-diagnostics-history';
    this.maxEntries = 50; // Keep last 50 measurements
  }

  saveMetrics(url, metrics) {
    try {
      const history = this.getHistory();
      
      const entry = {
        url,
        timestamp: Date.now(),
        date: new Date().toISOString(),
        metrics: {
          lcp: metrics.lcp,
          inp: metrics.inp,
          fid: metrics.fid,
          cls: metrics.cls,
          fcp: metrics.fcp,
          ttfb: metrics.ttfb,
          performanceScore: metrics.performanceScore,
          totalResources: metrics.totalResources,
          totalSize: metrics.totalSize,
          thirdPartyCount: metrics.thirdPartyCount,
          thirdPartySize: metrics.thirdPartySize
        }
      };

      history.unshift(entry); // Add to beginning
      
      // Keep only last N entries
      if (history.length > this.maxEntries) {
        history.splice(this.maxEntries);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(history));
      return true;
    } catch (error) {
      console.error('Failed to save metrics to history:', error);
      return false;
    }
  }

  getHistory() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    }
  }

  getHistoryForUrl(url) {
    const history = this.getHistory();
    return history.filter(entry => entry.url === url);
  }

  clearHistory() {
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.error('Failed to clear history:', error);
      return false;
    }
  }

  getStats(url = null) {
    const history = url ? this.getHistoryForUrl(url) : this.getHistory();
    
    if (history.length === 0) {
      return null;
    }

    const metrics = ['lcp', 'inp', 'cls', 'fcp', 'ttfb', 'performanceScore'];
    const stats = {};

    metrics.forEach(metric => {
      const values = history
        .map(entry => entry.metrics[metric])
        .filter(val => val !== null && val !== undefined && !isNaN(val));

      if (values.length > 0) {
        stats[metric] = {
          current: values[0],
          average: values.reduce((sum, val) => sum + val, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          trend: this.calculateTrend(values)
        };
      }
    });

    return {
      totalMeasurements: history.length,
      stats
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(0, Math.min(5, values.length));
    const older = values.slice(Math.min(5, values.length));
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (Math.abs(change) < 5) return 'stable';
    return change < 0 ? 'improving' : 'degrading';
  }

  exportToJSON() {
    const history = this.getHistory();
    const dataStr = JSON.stringify(history, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    return URL.createObjectURL(dataBlob);
  }

  exportToCSV() {
    const history = this.getHistory();
    
    if (history.length === 0) {
      return null;
    }

    // CSV headers
    const headers = [
      'Date',
      'URL',
      'LCP (ms)',
      'INP (ms)',
      'FID (ms)',
      'CLS',
      'FCP (ms)',
      'TTFB (ms)',
      'Performance Score',
      'Total Resources',
      'Total Size (MB)',
      'Third-party Requests',
      'Third-party Size (MB)'
    ];

    // CSV rows
    const rows = history.map(entry => [
      new Date(entry.timestamp).toLocaleString(),
      entry.url,
      entry.metrics.lcp || '',
      entry.metrics.inp || '',
      entry.metrics.fid || '',
      entry.metrics.cls || '',
      entry.metrics.fcp || '',
      entry.metrics.ttfb || '',
      entry.metrics.performanceScore || '',
      entry.metrics.totalResources || '',
      entry.metrics.totalSize ? (entry.metrics.totalSize / 1024 / 1024).toFixed(2) : '',
      entry.metrics.thirdPartyCount || '',
      entry.metrics.thirdPartySize ? (entry.metrics.thirdPartySize / 1024 / 1024).toFixed(2) : ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    return URL.createObjectURL(dataBlob);
  }
}

export const historicalTracker = new HistoricalTracker();
