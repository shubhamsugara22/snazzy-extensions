class ApiMonitor {
  analyzeApiCalls(resources) {
    // Filter for API calls (fetch, XHR, and common API patterns)
    const apiCalls = resources.filter(r => 
      r.initiatorType === 'fetch' || 
      r.initiatorType === 'xmlhttprequest' ||
      this.isApiUrl(r.name)
    );

    const analysis = {
      totalCalls: apiCalls.length,
      calls: [],
      byDomain: {},
      byStatus: { success: 0, error: 0, unknown: 0 },
      performance: {
        fastest: null,
        slowest: null,
        average: 0,
        total: 0
      },
      issues: []
    };

    if (apiCalls.length === 0) {
      return analysis;
    }

    // Analyze each API call
    apiCalls.forEach(call => {
      const callData = this.analyzeCall(call);
      analysis.calls.push(callData);

      // Group by domain
      const domain = callData.domain;
      if (!analysis.byDomain[domain]) {
        analysis.byDomain[domain] = {
          count: 0,
          totalDuration: 0,
          totalSize: 0,
          calls: []
        };
      }
      analysis.byDomain[domain].count++;
      analysis.byDomain[domain].totalDuration += callData.duration;
      analysis.byDomain[domain].totalSize += callData.size;
      analysis.byDomain[domain].calls.push(callData);

      // Track status
      if (callData.status === 'success') analysis.byStatus.success++;
      else if (callData.status === 'error') analysis.byStatus.error++;
      else analysis.byStatus.unknown++;

      // Track performance
      analysis.performance.total += callData.duration;
    });

    // Calculate performance stats
    analysis.performance.average = analysis.performance.total / apiCalls.length;
    const sortedByDuration = [...apiCalls].sort((a, b) => b.duration - a.duration);
    analysis.performance.slowest = sortedByDuration[0];
    analysis.performance.fastest = sortedByDuration[sortedByDuration.length - 1];

    // Sort calls by duration (slowest first)
    analysis.calls.sort((a, b) => b.duration - a.duration);

    // Convert byDomain to array and sort
    analysis.byDomain = Object.entries(analysis.byDomain)
      .map(([domain, data]) => ({
        domain,
        ...data,
        avgDuration: data.totalDuration / data.count
      }))
      .sort((a, b) => b.count - a.count);

    // Detect issues
    analysis.issues = this.detectIssues(analysis);

    return analysis;
  }

  analyzeCall(call) {
    const url = new URL(call.name);
    
    return {
      url: call.name,
      domain: url.hostname,
      path: url.pathname,
      method: this.guessMethod(call),
      duration: call.duration,
      size: call.transferSize || 0,
      status: this.guessStatus(call),
      type: call.initiatorType,
      timing: {
        dns: call.domainLookupEnd - call.domainLookupStart,
        tcp: call.connectEnd - call.connectStart,
        request: call.responseStart - call.requestStart,
        response: call.responseEnd - call.responseStart
      }
    };
  }

  guessMethod(call) {
    // We can't get the actual HTTP method from Resource Timing API
    // But we can make educated guesses
    const url = call.name.toLowerCase();
    
    if (call.initiatorType === 'fetch' || call.initiatorType === 'xmlhttprequest') {
      // Common patterns
      if (url.includes('/api/') || url.includes('/graphql')) {
        return 'POST/GET'; // Could be either
      }
    }
    
    return 'GET'; // Default assumption
  }

  guessStatus(call) {
    // Resource Timing API doesn't give us HTTP status codes
    // We can only infer from transfer size and duration
    if (call.transferSize === 0 && call.duration > 0) {
      return 'error'; // Likely failed (no data transferred)
    } else if (call.transferSize > 0) {
      return 'success'; // Data was transferred
    }
    return 'unknown';
  }

  isApiUrl(url) {
    const lowerUrl = url.toLowerCase();
    const apiPatterns = [
      '/api/',
      '/rest/',
      '/graphql',
      '/v1/',
      '/v2/',
      '/v3/',
      '.json',
      '/data/',
      '/service/',
      '/endpoint/'
    ];
    
    return apiPatterns.some(pattern => lowerUrl.includes(pattern));
  }

  detectIssues(analysis) {
    const issues = [];

    // Slow API calls (>1s)
    const slowCalls = analysis.calls.filter(c => c.duration > 1000);
    if (slowCalls.length > 0) {
      issues.push({
        type: 'slow-calls',
        severity: 'high',
        count: slowCalls.length,
        message: `${slowCalls.length} API call${slowCalls.length > 1 ? 's' : ''} taking over 1 second`,
        recommendation: 'Optimize slow endpoints or implement caching',
        calls: slowCalls.slice(0, 5)
      });
    }

    // Too many calls to same domain
    const heavyDomains = analysis.byDomain.filter(d => d.count > 10);
    if (heavyDomains.length > 0) {
      issues.push({
        type: 'many-calls',
        severity: 'medium',
        count: heavyDomains.length,
        message: `${heavyDomains.length} domain${heavyDomains.length > 1 ? 's' : ''} with 10+ API calls`,
        recommendation: 'Consider batching requests or using GraphQL',
        domains: heavyDomains
      });
    }

    // Large response sizes (>1MB)
    const largeCalls = analysis.calls.filter(c => c.size > 1000000);
    if (largeCalls.length > 0) {
      issues.push({
        type: 'large-responses',
        severity: 'medium',
        count: largeCalls.length,
        message: `${largeCalls.length} API call${largeCalls.length > 1 ? 's' : ''} with responses over 1MB`,
        recommendation: 'Implement pagination or reduce payload size',
        calls: largeCalls.slice(0, 5)
      });
    }

    // Potential errors
    if (analysis.byStatus.error > 0) {
      issues.push({
        type: 'errors',
        severity: 'high',
        count: analysis.byStatus.error,
        message: `${analysis.byStatus.error} API call${analysis.byStatus.error > 1 ? 's' : ''} may have failed`,
        recommendation: 'Check network tab for error details'
      });
    }

    // Sequential calls (could be parallelized)
    const sequential = this.detectSequentialCalls(analysis.calls);
    if (sequential.length > 0) {
      issues.push({
        type: 'sequential',
        severity: 'low',
        count: sequential.length,
        message: `${sequential.length} group${sequential.length > 1 ? 's' : ''} of sequential API calls detected`,
        recommendation: 'Consider parallelizing independent API calls'
      });
    }

    return issues;
  }

  detectSequentialCalls(calls) {
    // Simple heuristic: calls to same domain within 100ms of each other
    const sequential = [];
    const byDomain = {};

    calls.forEach(call => {
      if (!byDomain[call.domain]) {
        byDomain[call.domain] = [];
      }
      byDomain[call.domain].push(call);
    });

    Object.entries(byDomain).forEach(([domain, domainCalls]) => {
      if (domainCalls.length > 2) {
        sequential.push({ domain, count: domainCalls.length });
      }
    });

    return sequential;
  }

  generateSummary(analysis) {
    const totalDuration = analysis.performance.total;
    const avgDuration = analysis.performance.average;
    const totalSize = analysis.calls.reduce((sum, c) => sum + c.size, 0);

    return {
      totalCalls: analysis.totalCalls,
      totalDuration: totalDuration.toFixed(0),
      avgDuration: avgDuration.toFixed(0),
      totalSize: (totalSize / 1024 / 1024).toFixed(2),
      successRate: analysis.totalCalls > 0 
        ? ((analysis.byStatus.success / analysis.totalCalls) * 100).toFixed(1)
        : 0,
      issueCount: analysis.issues.length
    };
  }
}

export const apiMonitor = new ApiMonitor();
