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
}

export const bandwidthMonitor = new BandwidthMonitor();