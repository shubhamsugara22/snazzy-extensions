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
            cls: 0,
            inp: null
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

          // Get INP (Interaction to Next Paint) - new Core Web Vital
          // Calculate from event timing entries
          const eventEntries = performance.getEntriesByType('event');
          if (eventEntries.length > 0) {
            const interactionDelays = eventEntries
              .filter(entry => entry.duration > 0)
              .map(entry => entry.duration);
            
            if (interactionDelays.length > 0) {
              // INP is the 98th percentile of all interaction delays
              interactionDelays.sort((a, b) => a - b);
              const p98Index = Math.floor(interactionDelays.length * 0.98);
              vitals.inp = interactionDelays[p98Index] || interactionDelays[interactionDelays.length - 1];
            }
          }

          return vitals;
        }
      });

      return injection && injection[0] && injection[0].result ? injection[0].result : { lcp: null, fid: null, cls: 0, inp: null };
    } catch (error) {
      console.error('Error collecting Web Vitals:', error);
      return { lcp: null, fid: null, cls: 0, inp: null };
    }
  }
  
  getThreshold(metric, value) {
    const thresholds = {
      lcp: { good: 2500, needsImprovement: 4000 },
      fid: { good: 100, needsImprovement: 300 },
      cls: { good: 0.1, needsImprovement: 0.25 },
      inp: { good: 200, needsImprovement: 500 }
    };
    
    if (value === null || value === undefined) return 'unknown';
    const t = thresholds[metric];
    if (!t) return 'unknown';
    
    if (value < t.good) return 'good';
    if (value < t.needsImprovement) return 'needs-improvement';
    return 'poor';
  }
}

export const webVitalsCollector = new WebVitalsCollector();