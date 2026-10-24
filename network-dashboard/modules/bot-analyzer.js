export const botAnalyzer = {
  analyze(botSignals, resources) {
    const analysis = {
      browserTrust: {
        score: 100, // 0 to 100
        category: 'human', // human, suspicious, bot
        flags: []
      },
      agentsOnPage: []
    };

    // 1. Analyze Browser Bot Signals
    if (botSignals) {
      if (botSignals.webdriver) {
        analysis.browserTrust.score -= 50;
        analysis.browserTrust.flags.push('navigator.webdriver is true');
      }
      if (botSignals.pluginsLength === 0) {
        analysis.browserTrust.score -= 10;
        analysis.browserTrust.flags.push('No browser plugins detected');
      }
      const ua = (botSignals.userAgent || '').toLowerCase();
      if (ua.includes('headless')) {
        analysis.browserTrust.score -= 40;
        analysis.browserTrust.flags.push('Headless browser user-agent');
      }
      if (ua.includes('bot') || ua.includes('crawl') || ua.includes('spider')) {
        analysis.browserTrust.score -= 80;
        analysis.browserTrust.flags.push('Bot-like user-agent string');
      }
    }

    if (analysis.browserTrust.score <= 30) {
      analysis.browserTrust.category = 'bot';
    } else if (analysis.browserTrust.score <= 70) {
      analysis.browserTrust.category = 'suspicious';
    }

    // 2. Analyze Resources for Known Agents
    const agentSignatures = [
      { id: 'recaptcha', name: 'reCAPTCHA', type: 'Bot Mitigation', pattern: /recaptcha\/api\.js/i },
      { id: 'turnstile', name: 'Cloudflare Turnstile', type: 'Bot Mitigation', pattern: /turnstile\/v\d+\/api\.js/i },
      { id: 'datadog', name: 'Datadog RUM', type: 'Analytics', pattern: /datadoghq-browser-agent/i },
      { id: 'google_analytics', name: 'Google Analytics', type: 'Analytics', pattern: /google-analytics\.com\/analytics\.js|googletagmanager\.com\/gtag\/js/i },
      { id: 'newrelic', name: 'New Relic', type: 'Analytics', pattern: /js-agent\.newrelic\.com/i },
      { id: 'sentry', name: 'Sentry', type: 'Error Tracking', pattern: /browser\.sentry-cdn\.com/i },
      { id: 'hotjar', name: 'Hotjar', type: 'Analytics', pattern: /static\.hotjar\.com/i },
      { id: 'facebook_pixel', name: 'Facebook Pixel', type: 'Marketing', pattern: /connect\.facebook\.net\/en_US\/fbevents\.js/i },
      { id: 'segment', name: 'Segment', type: 'Analytics', pattern: /cdn\.segment\.com/i },
      { id: 'intercom', name: 'Intercom', type: 'Chat Widget', pattern: /widget\.intercom\.io/i },
      { id: 'akamai', name: 'Akamai Bot Manager', type: 'Bot Mitigation', pattern: /akamai\/bot/i } // approximate
    ];

    const detectedAgents = new Map();

    resources.forEach(res => {
      agentSignatures.forEach(sig => {
        if (sig.pattern.test(res.name)) {
          if (!detectedAgents.has(sig.id)) {
            detectedAgents.set(sig.id, {
              name: sig.name,
              type: sig.type,
              count: 1,
              urls: [res.name]
            });
          } else {
            const agent = detectedAgents.get(sig.id);
            agent.count++;
            agent.urls.push(res.name);
          }
        }
      });
    });

    analysis.agentsOnPage = Array.from(detectedAgents.values());

    return analysis;
  },

  render(analysis, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '<div class="bot-analysis">';
    
    // Browser Trust Score
    const scoreColor = analysis.browserTrust.category === 'human' ? '#0cce6b' : (analysis.browserTrust.category === 'suspicious' ? '#ffa400' : '#ff4e42');
    const scoreIcon = analysis.browserTrust.category === 'human' ? '👤' : (analysis.browserTrust.category === 'suspicious' ? '🕵️' : '🤖');
    
    html += '<div class="browser-trust-panel">';
    html += `<div class="trust-icon">${scoreIcon}</div>`;
    html += '<div>';
    html += `<h4>Session Trust Score: <span style="color: ${scoreColor}">${analysis.browserTrust.score}%</span></h4>`;
    
    if (analysis.browserTrust.flags.length === 0) {
      html += '<div class="trust-note">Your browser appears to be a normal human user.</div>';
    } else {
      html += '<div class="trust-note">Flags detected:</div>';
      html += '<ul class="trust-flags">';
      analysis.browserTrust.flags.forEach(flag => {
        html += `<li>${flag}</li>`;
      });
      html += '</ul>';
    }
    html += '</div></div>';

    // Agents on Page
    html += '<div class="agents-on-page-panel">';
    html += '<h4>🕵️ Detected Agents on Page</h4>';
    
    if (analysis.agentsOnPage.length === 0) {
      html += '<div class="agent-empty">No known bot mitigation or analytics agents detected.</div>';
    } else {
      html += '<div class="agent-grid">';
      analysis.agentsOnPage.forEach(agent => {
        let typeBadge = '';
        if (agent.type === 'Bot Mitigation') typeBadge = '<span class="agent-badge mitigation">Bot Mitigation</span>';
        else if (agent.type === 'Analytics') typeBadge = '<span class="agent-badge analytics">Analytics</span>';
        else typeBadge = `<span class="agent-badge">${agent.type}</span>`;
        
        html += `<div class="agent-card">`;
        html += `<div class="agent-card-head">`;
        html += `<strong>${agent.name}</strong>${typeBadge}`;
        html += `</div>`;
        html += `<div class="agent-count">${agent.count} script(s) loaded</div>`;
        html += `</div>`;
      });
      html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }
};
