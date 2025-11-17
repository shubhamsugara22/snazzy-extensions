class ImageOptimizer {
  analyzeImages(resources) {
    const images = resources.filter(r => 
      r.initiatorType === 'img' || 
      this.isImageUrl(r.name)
    );

    const issues = [];
    let totalWaste = 0;

    images.forEach(img => {
      const imgIssues = this.checkImage(img);
      if (imgIssues.length > 0) {
        issues.push({
          url: img.name,
          size: img.transferSize,
          issues: imgIssues,
          potentialSavings: this.calculateSavings(img, imgIssues)
        });
        totalWaste += this.calculateSavings(img, imgIssues);
      }
    });

    return {
      totalImages: images.length,
      imagesWithIssues: issues.length,
      issues: issues.sort((a, b) => b.potentialSavings - a.potentialSavings),
      totalPotentialSavings: totalWaste,
      summary: this.generateSummary(images, issues)
    };
  }

  checkImage(img) {
    const issues = [];
    const url = img.name.toLowerCase();
    const size = img.transferSize || 0;

    // Check if uncompressed (no modern format)
    if (!url.includes('.webp') && !url.includes('.avif')) {
      if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg')) {
        issues.push({
          type: 'format',
          severity: 'medium',
          message: 'Not using modern format (WebP/AVIF)',
          recommendation: 'Convert to WebP for 25-35% size reduction'
        });
      }
    }

    // Check if large file size
    if (size > 500000) { // > 500KB
      issues.push({
        type: 'size',
        severity: 'high',
        message: `Large image size: ${(size / 1024 / 1024).toFixed(2)} MB`,
        recommendation: 'Compress image or use responsive images'
      });
    } else if (size > 200000) { // > 200KB
      issues.push({
        type: 'size',
        severity: 'medium',
        message: `Image could be smaller: ${(size / 1024).toFixed(0)} KB`,
        recommendation: 'Consider compression or optimization'
      });
    }

    // Check compression ratio
    if (img.encodedBodySize && img.decodedBodySize) {
      const ratio = img.encodedBodySize / img.decodedBodySize;
      if (ratio > 0.9) { // Less than 10% compression
        issues.push({
          type: 'compression',
          severity: 'medium',
          message: 'Image appears uncompressed',
          recommendation: 'Enable image compression on server'
        });
      }
    }

    // Check for potential lazy loading candidates
    if (size > 100000) { // > 100KB
      issues.push({
        type: 'loading',
        severity: 'low',
        message: 'Could benefit from lazy loading',
        recommendation: 'Add loading="lazy" attribute'
      });
    }

    return issues;
  }

  calculateSavings(img, issues) {
    let savings = 0;
    const size = img.transferSize || 0;

    issues.forEach(issue => {
      if (issue.type === 'format') {
        savings += size * 0.3; // 30% savings from WebP
      } else if (issue.type === 'compression') {
        savings += size * 0.4; // 40% savings from compression
      } else if (issue.type === 'size') {
        savings += size * 0.5; // 50% savings from proper sizing
      }
    });

    return Math.min(savings, size * 0.7); // Cap at 70% savings
  }

  isImageUrl(url) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.includes(ext));
  }

  generateSummary(allImages, issues) {
    const totalSize = allImages.reduce((sum, img) => sum + (img.transferSize || 0), 0);
    const issueTypes = {};

    issues.forEach(img => {
      img.issues.forEach(issue => {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      });
    });

    return {
      totalImageSize: totalSize,
      averageImageSize: allImages.length > 0 ? totalSize / allImages.length : 0,
      issueBreakdown: issueTypes,
      optimizationScore: this.calculateOptimizationScore(allImages, issues)
    };
  }

  calculateOptimizationScore(allImages, issues) {
    if (allImages.length === 0) return 100;
    
    const issueCount = issues.length;
    const totalImages = allImages.length;
    const ratio = issueCount / totalImages;

    if (ratio === 0) return 100;
    if (ratio < 0.2) return 90;
    if (ratio < 0.4) return 75;
    if (ratio < 0.6) return 60;
    if (ratio < 0.8) return 40;
    return 20;
  }
}

export const imageOptimizer = new ImageOptimizer();
