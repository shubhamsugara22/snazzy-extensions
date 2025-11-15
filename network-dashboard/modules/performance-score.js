class PerformanceScoreCalculator {
  calculateScore(metrics) {
    const weights = {
      lcp: 0.25,
      inp: 0.25,
      cls: 0.15,
      fcp: 0.15,
      ttfb: 0.10,
      tbt: 0.10
    };

    const scores = {
      lcp: this.scoreLCP(metrics.lcp),
      inp: this.scoreINP(metrics.inp),
      cls: this.scoreCLS(metrics.cls),
      fcp: this.scoreFCP(metrics.fcp),
      ttfb: this.scoreTTFB(metrics.ttfb),
      tbt: this.scoreTBT(metrics.tbt)
    };

    let totalScore = 0;
    let totalWeight = 0;

    Object.keys(weights).forEach(key => {
      if (scores[key] !== null && !isNaN(scores[key])) {
        totalScore += scores[key] * weights[key];
        totalWeight += weights[key];
      }
    });

    // If no valid scores, return a default
    if (totalWeight === 0) {
      return {
        overall: 0,
        category: 'unknown',
        breakdown: scores
      };
    }

    const finalScore = Math.round(totalScore / totalWeight);
    
    return {
      overall: finalScore,
      category: this.getCategory(finalScore),
      breakdown: scores
    };
  }

  scoreLCP(lcp) {
    if (lcp === null || lcp === undefined) return null;
    if (lcp <= 2500) return 100;
    if (lcp >= 4000) return 0;
    return Math.round(100 - ((lcp - 2500) / 1500) * 100);
  }

  scoreINP(inp) {
    if (inp === null || inp === undefined) return null;
    if (inp <= 200) return 100;
    if (inp >= 500) return 0;
    return Math.round(100 - ((inp - 200) / 300) * 100);
  }

  scoreCLS(cls) {
    if (cls === null || cls === undefined) return null;
    if (cls <= 0.1) return 100;
    if (cls >= 0.25) return 0;
    return Math.round(100 - ((cls - 0.1) / 0.15) * 100);
  }

  scoreFCP(fcp) {
    if (fcp === null || fcp === undefined) return null;
    if (fcp <= 1800) return 100;
    if (fcp >= 3000) return 0;
    return Math.round(100 - ((fcp - 1800) / 1200) * 100);
  }

  scoreTTFB(ttfb) {
    if (ttfb === null || ttfb === undefined) return null;
    if (ttfb <= 800) return 100;
    if (ttfb >= 1800) return 0;
    return Math.round(100 - ((ttfb - 800) / 1000) * 100);
  }

  scoreTBT(tbt) {
    if (tbt === null || tbt === undefined) return null;
    if (tbt <= 200) return 100;
    if (tbt >= 600) return 0;
    return Math.round(100 - ((tbt - 200) / 400) * 100);
  }

  getCategory(score) {
    if (isNaN(score) || score === null || score === undefined) return 'unknown';
    if (score >= 90) return 'good';
    if (score >= 50) return 'needs-improvement';
    if (score > 0) return 'poor';
    return 'unknown';
  }
}

export const performanceScoreCalculator = new PerformanceScoreCalculator();
