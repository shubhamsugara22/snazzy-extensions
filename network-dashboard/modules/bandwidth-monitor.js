class BandwidthMonitor {
  constructor() {
    this.measurements = [];
  }

  measureConnectionSpeed() {
    const connection = navigator.connection;
    return {
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false
    };
  }

  calculateBandwidthUsage(resources) {
    return resources.reduce((total, resource) => {
      return total + (resource.transferSize || 0);
    }, 0);
  }
}

export const bandwidthMonitor = new BandwidthMonitor();