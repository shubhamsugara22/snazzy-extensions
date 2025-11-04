class BandwidthMonitor {
  constructor() {
    this.measurements = [];
  }

  async measureConnectionSpeed(tabId) {
    try {
      const injection = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          return {
            effectiveType: connection?.effectiveType || 'unknown',
            downlink: connection?.downlink || 0,
            rtt: connection?.rtt || 0,
            saveData: connection?.saveData || false
          };
        }
      });

      return injection && injection[0] && injection[0].result ? injection[0].result : {
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
        saveData: false
      };
    } catch (error) {
      console.error('Error measuring connection speed:', error);
      return {
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
        saveData: false
      };
    }
  }

  calculateBandwidthUsage(resources) {
    return resources.reduce((total, resource) => {
      return total + (resource.transferSize || 0);
    }, 0);
  }
  
  getBandwidthBreakdown(resources) {
    const breakdown = {};
    
    resources.forEach(resource => {
      const type = this.categorizeResourceType(resource.initiatorType, resource.name);
      
      if (!breakdown[type]) {
        breakdown[type] = { count: 0, size: 0 };
      }
      
      breakdown[type].count++;
      breakdown[type].size += resource.transferSize || 0;
    });
    
    // Sort by size descending
    return Object.fromEntries(
      Object.entries(breakdown).sort((a, b) => b[1].size - a[1].size)
    );
  }
  
  categorizeResourceType(initiatorType, name) {
    // Map initiator types to friendly names
    const typeMap = {
      'script': 'JavaScript',
      'link': 'CSS',
      'img': 'Images',
      'css': 'CSS',
      'fetch': 'API Calls',
      'xmlhttprequest': 'XHR',
      'other': 'Other'
    };
    
    // Check file extension if initiatorType is generic
    if (initiatorType === 'other' || !initiatorType) {
      const ext = name.split('.').pop().split('?')[0].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return 'Images';
      if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'Fonts';
      if (['mp4', 'webm', 'ogg'].includes(ext)) return 'Video';
      if (['mp3', 'wav', 'aac'].includes(ext)) return 'Audio';
    }
    
    return typeMap[initiatorType] || 'Other';
  }
}

export const bandwidthMonitor = new BandwidthMonitor();