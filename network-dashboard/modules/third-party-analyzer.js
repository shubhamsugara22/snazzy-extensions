class ThirdPartyAnalyzer {
  analyze(resources, currentDomain) {
    const byDomain = {};
    let firstPartySize = 0;
    let thirdPartySize = 0;

    resources.forEach(resource => {
      try {
        const url = new URL(resource.name);
        const domain = url.hostname;
        const isThirdParty = domain !== currentDomain;

        if (isThirdParty) {
          if (!byDomain[domain]) {
            byDomain[domain] = {
              domain,
              count: 0,
              size: 0,
              duration: 0,
              resources: []
            };
          }

          byDomain[domain].count++;
          byDomain[domain].size += resource.transferSize || 0;
          byDomain[domain].duration += resource.duration || 0;
          byDomain[domain].resources.push(resource);
          
          thirdPartySize += resource.transferSize || 0;
        } else {
          firstPartySize += resource.transferSize || 0;
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Convert to array and sort by size
    const thirdPartyDomains = Object.values(byDomain).sort((a, b) => b.size - a.size);

    return {
      domains: thirdPartyDomains,
      totalThirdPartySize: thirdPartySize,
      totalFirstPartySize: firstPartySize,
      thirdPartyCount: thirdPartyDomains.reduce((sum, d) => sum + d.count, 0),
      domainCount: thirdPartyDomains.length
    };
  }

  render(analysis, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalSize = analysis.totalFirstPartySize + analysis.totalThirdPartySize;
    const thirdPartyPercent = totalSize > 0 ? (analysis.totalThirdPartySize / totalSize * 100).toFixed(1) : 0;

    let html = '<div class="third-party-analysis">';
    
    // Summary
    html += '<div class="third-party-summary">';
    html += `<div class="summary-stat">`;
    html += `<span class="stat-label">Third-party Domains:</span>`;
    html += `<span class="stat-value">${analysis.domainCount}</span>`;
    html += `</div>`;
    html += `<div class="summary-stat">`;
    html += `<span class="stat-label">Third-party Requests:</span>`;
    html += `<span class="stat-value">${analysis.thirdPartyCount}</span>`;
    html += `</div>`;
    html += `<div class="summary-stat">`;
    html += `<span class="stat-label">Third-party Size:</span>`;
    html += `<span class="stat-value">${(analysis.totalThirdPartySize / 1024 / 1024).toFixed(2)} MB (${thirdPartyPercent}%)</span>`;
    html += `</div>`;
    html += '</div>';

    // Domain breakdown
    if (analysis.domains.length > 0) {
      html += '<div class="third-party-domains">';
      html += '<h4>Top Third-party Domains:</h4>';
      
      analysis.domains.slice(0, 10).forEach(domain => {
        const sizeMB = (domain.size / 1024 / 1024).toFixed(2);
        const avgDuration = (domain.duration / domain.count).toFixed(0);
        
        html += '<div class="domain-item">';
        html += `<div class="domain-name" title="${domain.domain}">${domain.domain}</div>`;
        html += `<div class="domain-stats">`;
        html += `<span class="domain-count">${domain.count} requests</span>`;
        html += `<span class="domain-size">${sizeMB} MB</span>`;
        html += `<span class="domain-duration">~${avgDuration}ms avg</span>`;
        html += `</div>`;
        html += '</div>';
      });

      if (analysis.domains.length > 10) {
        html += `<div class="domains-more">+ ${analysis.domains.length - 10} more domains</div>`;
      }

      html += '</div>';
    } else {
      html += '<p class="no-third-party">No third-party resources detected</p>';
    }

    html += '</div>';
    
    container.innerHTML = html;
  }
}

export const thirdPartyAnalyzer = new ThirdPartyAnalyzer();
