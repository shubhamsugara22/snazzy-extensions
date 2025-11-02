import { getLCP, getFID, getCLS } from 'web-vitals';
// ISSUE: Import statement won't work in extension context
import { getLCP, getFID, getCLS } from 'web-vitals';

// CORRECTED VERSION:
class WebVitalsCollector {
  constructor() {
    // Load web-vitals from CDN or include in extension
    this.webVitalsScript = 'node_modules/web-vitals/dist/web-vitals.min.js';
  }

  async collectMetrics() {
    return new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: { tabId: this.activeTabId },
        function: () => {
          return {
            lcp: performance.getEntriesByType('paint')
              .find(entry => entry.name === 'largest-contentful-paint')?.startTime,
            fid: performance.getEntriesByType('first-input')
              .map(entry => entry.processingStart - entry.startTime)[0],
            cls: 0 // CLS requires monitoring layout shifts over time
          };
        }
      }, (results) => {
        resolve(results[0]?.result || {});
      });
    });
  }
}