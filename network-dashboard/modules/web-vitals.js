class WebVitalsCollector {
  async collectMetrics(tabId) {
    try {
      const injection = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Collect Web Vitals using Performance API
          const vitals = {
            lcp: null,
            fid: null,
            cls: 0
          };

          // Get LCP (Largest Contentful Paint)
          const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
          if (lcpEntries.length > 0) {
            vitals.lcp = lcpEntries[lcpEntries.length - 1].renderTime || lcpEntries[lcpEntries.length - 1].loadTime;
          }

          // Get FID (First Input Delay) - approximation using first-input
          const fidEntries = performance.getEntriesByType('first-input');
          if (fidEntries.length > 0) {
            vitals.fid = fidEntries[0].processingStart - fidEntries[0].startTime;
          }

          // Get CLS (Cumulative Layout Shift)
          const clsEntries = performance.getEntriesByType('layout-shift');
          let clsScore = 0;
          clsEntries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsScore += entry.value;
            }
          });
          vitals.cls = clsScore;

          return vitals;
        }
      });

      return injection && injection[0] && injection[0].result ? injection[0].result : { lcp: null, fid: null, cls: 0 };
    } catch (error) {
      console.error('Error collecting Web Vitals:', error);
      return { lcp: null, fid: null, cls: 0 };
    }
  }
}

export const webVitalsCollector = new WebVitalsCollector();