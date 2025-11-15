class WaterfallChart {
  render(resources, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Sort resources by start time
    const sortedResources = [...resources].sort((a, b) => a.startTime - b.startTime);
    
    // Find the earliest start and latest end
    const startTime = sortedResources[0]?.startTime || 0;
    const endTime = Math.max(...sortedResources.map(r => r.startTime + r.duration));
    const totalDuration = endTime - startTime;

    if (totalDuration === 0) {
      container.innerHTML = '<p>No timing data available</p>';
      return;
    }

    // Limit to first 50 resources for performance
    const displayResources = sortedResources.slice(0, 50);

    let html = '<div class="waterfall-chart">';
    html += '<div class="waterfall-header">';
    html += '<div class="waterfall-label">Resource</div>';
    html += '<div class="waterfall-timeline">Timeline</div>';
    html += '<div class="waterfall-duration">Duration</div>';
    html += '</div>';

    displayResources.forEach(resource => {
      const relativeStart = resource.startTime - startTime;
      const leftPercent = (relativeStart / totalDuration) * 100;
      const widthPercent = (resource.duration / totalDuration) * 100;
      
      const fileName = this.getFileName(resource.name);
      const typeClass = this.getTypeClass(resource.initiatorType);
      
      html += '<div class="waterfall-row">';
      html += `<div class="waterfall-label" title="${resource.name}">${fileName}</div>`;
      html += '<div class="waterfall-timeline">';
      html += `<div class="waterfall-bar ${typeClass}" style="left: ${leftPercent}%; width: ${Math.max(widthPercent, 0.5)}%;" title="${resource.duration.toFixed(2)}ms"></div>`;
      html += '</div>';
      html += `<div class="waterfall-duration">${resource.duration.toFixed(0)}ms</div>`;
      html += '</div>';
    });

    if (sortedResources.length > 50) {
      html += `<div class="waterfall-more">+ ${sortedResources.length - 50} more resources</div>`;
    }

    html += '</div>';
    
    container.innerHTML = html;
  }

  getFileName(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const fileName = path.split('/').pop() || urlObj.hostname;
      return fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
    } catch {
      return url.substring(0, 40);
    }
  }

  getTypeClass(initiatorType) {
    const typeMap = {
      'script': 'type-script',
      'link': 'type-css',
      'img': 'type-image',
      'css': 'type-css',
      'fetch': 'type-fetch',
      'xmlhttprequest': 'type-xhr',
      'other': 'type-other'
    };
    return typeMap[initiatorType] || 'type-other';
  }
}

export const waterfallChart = new WaterfallChart();
