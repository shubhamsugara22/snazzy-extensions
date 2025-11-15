class RecommendationsEngine {
  generateRecommendations(metrics, resources, navigation) {
    const recommendations = [];

    // LCP recommendations
    if (metrics.lcp && metrics.lcp > 2500) {
      const priority = metrics.lcp > 4000 ? 'high' : 'medium';
      recommendations.push({
        priority,
        category: 'LCP',
        issue: `Largest Contentful Paint is ${(metrics.lcp / 1000).toFixed(2)}s`,
        suggestions: [
          'Optimize and compress images',
          'Preload critical resources',
          'Remove render-blocking resources',
          'Use a CDN for faster content delivery'
        ]
      });
    }

    // INP recommendations
    if (metrics.inp && metrics.inp > 200) {
      const priority = metrics.inp > 500 ? 'high' : 'medium';
      recommendations.push({
        priority,
        category: 'INP',
        issue: `Interaction to Next Paint is ${metrics.inp.toFixed(0)}ms`,
        suggestions: [
          'Reduce JavaScript execution time',
          'Break up long tasks',
          'Use web workers for heavy computations',
          'Defer non-critical JavaScript'
        ]
      });
    }

    // CLS recommendations
    if (metrics.cls && metrics.cls > 0.1) {
      const priority = metrics.cls > 0.25 ? 'high' : 'medium';
      recommendations.push({
        priority,
        category: 'CLS',
        issue: `Cumulative Layout Shift is ${metrics.cls.toFixed(3)}`,
        suggestions: [
          'Add size attributes to images and videos',
          'Reserve space for ad slots',
          'Avoid inserting content above existing content',
          'Use CSS transform instead of properties that trigger layout'
        ]
      });
    }

    // TTFB recommendations
    if (metrics.ttfb && metrics.ttfb > 800) {
      const priority = metrics.ttfb > 1800 ? 'high' : 'medium';
      recommendations.push({
        priority,
        category: 'TTFB',
        issue: `Time to First Byte is ${metrics.ttfb.toFixed(0)}ms`,
        suggestions: [
          'Optimize server response time',
          'Use a CDN',
          'Enable caching',
          'Reduce server processing time'
        ]
      });
    }

    // Resource-based recommendations
    const largeResources = resources.filter(r => r.transferSize > 1000000); // > 1MB
    if (largeResources.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Resources',
        issue: `${largeResources.length} large resources (>1MB) detected`,
        suggestions: [
          'Compress large files',
          'Use code splitting for JavaScript',
          'Lazy load images and videos',
          'Consider using WebP for images'
        ]
      });
    }

    // Third-party resources
    const thirdPartyResources = this.getThirdPartyResources(resources);
    if (thirdPartyResources.count > 10) {
      recommendations.push({
        priority: 'medium',
        category: 'Third-party',
        issue: `${thirdPartyResources.count} third-party requests detected`,
        suggestions: [
          'Audit and remove unnecessary third-party scripts',
          'Load third-party scripts asynchronously',
          'Self-host critical third-party resources',
          'Use facade patterns for heavy embeds (YouTube, etc.)'
        ]
      });
    }

    // Uncompressed resources
    const uncompressed = resources.filter(r => 
      r.transferSize > 0 && 
      r.encodedBodySize > 0 && 
      r.transferSize >= r.encodedBodySize * 0.95
    );
    if (uncompressed.length > 5) {
      recommendations.push({
        priority: 'low',
        category: 'Compression',
        issue: `${uncompressed.length} resources appear uncompressed`,
        suggestions: [
          'Enable gzip or brotli compression on server',
          'Compress text-based resources (HTML, CSS, JS)',
          'Minify JavaScript and CSS files'
        ]
      });
    }

    // Too many requests
    if (resources.length > 100) {
      recommendations.push({
        priority: 'medium',
        category: 'Resources',
        issue: `${resources.length} total requests - consider reducing`,
        suggestions: [
          'Bundle JavaScript and CSS files',
          'Use CSS sprites for small images',
          'Implement HTTP/2 server push',
          'Remove unused dependencies'
        ]
      });
    }

    // DNS lookup time
    if (navigation.domainLookupEnd && navigation.domainLookupStart) {
      const dnsTime = navigation.domainLookupEnd - navigation.domainLookupStart;
      if (dnsTime > 100) {
        recommendations.push({
          priority: 'low',
          category: 'DNS',
          issue: `DNS lookup took ${dnsTime.toFixed(0)}ms`,
          suggestions: [
            'Use DNS prefetching for external domains',
            'Consider using a faster DNS provider',
            'Reduce number of unique domains'
          ]
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  getThirdPartyResources(resources) {
    const currentDomain = window.location.hostname;
    const thirdParty = resources.filter(r => {
      try {
        const url = new URL(r.name);
        return url.hostname !== currentDomain;
      } catch {
        return false;
      }
    });

    return {
      count: thirdParty.length,
      resources: thirdParty
    };
  }
}

export const recommendationsEngine = new RecommendationsEngine();
