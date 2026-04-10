const STORAGE_KEY = 'network-dashboard-ai-settings';

class AIProviderClient {
  getDefaults() {
    return {
      enabled: false,
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: '',
      endpoint: 'http://localhost:11434'
    };
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...this.getDefaults(), ...JSON.parse(raw) } : this.getDefaults();
    } catch (error) {
      console.error('Failed to load AI settings:', error);
      return this.getDefaults();
    }
  }

  saveSettings(settings) {
    const merged = { ...this.getDefaults(), ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  isConfigured(settings) {
    if (!settings?.enabled) return false;
    if (!settings.model) return false;
    if (settings.provider === 'ollama') return Boolean(settings.endpoint);
    return Boolean(settings.apiKey);
  }

  sanitizeResources(resources) {
    return [...resources]
      .sort((a, b) => (b.duration + (b.transferSize || 0) / 1000) - (a.duration + (a.transferSize || 0) / 1000))
      .slice(0, 20)
      .map((resource) => ({
        name: this.compactUrl(resource.name),
        type: resource.initiatorType || 'other',
        duration: Math.round(resource.duration || 0),
        transferSize: resource.transferSize || 0
      }));
  }

  compactUrl(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.length > 60 ? `${parsed.pathname.slice(0, 57)}...` : parsed.pathname;
      return `${parsed.hostname}${path}`;
    } catch {
      return String(url).slice(0, 80);
    }
  }

  buildPrompt(payload) {
    return {
      domain: payload.domain,
      score: payload.score,
      vitals: payload.vitals,
      metrics: payload.metrics,
      totals: payload.totals,
      topResources: this.sanitizeResources(payload.resources)
    };
  }

  buildInstructions(payload) {
    return [
      'You are a network troubleshooting analyst.',
      'Analyze the summarized browser performance payload and return strict JSON only.',
      'Focus on networking, backend latency, payload bloat, client bottlenecks, and API health.',
      'Return this schema exactly:',
      '{"summary":"string","topPriority":[{"priority":"high|medium|low","title":"string","description":"string","impact":"string","suggestions":["string"]}],"quickWins":[{"priority":"high|medium|low","title":"string","description":"string","impact":"string","suggestions":["string"]}],"smartSuggestions":[{"title":"string","reason":"string","benefit":"string","implementation":["string"]}],"incidents":[{"severity":"high|medium|low","title":"string","evidence":"string","action":"string"}]}',
      `Payload: ${JSON.stringify(this.buildPrompt(payload))}`
    ].join('\n');
  }

  normalizeReport(parsed) {
    return {
      report: {
        summary: parsed.summary || 'Remote AI analysis completed.',
        topPriority: Array.isArray(parsed.topPriority) ? parsed.topPriority : [],
        quickWins: Array.isArray(parsed.quickWins) ? parsed.quickWins : [],
        smartSuggestions: Array.isArray(parsed.smartSuggestions) ? parsed.smartSuggestions : [],
        incidents: Array.isArray(parsed.incidents) ? parsed.incidents : []
      }
    };
  }

  extractJson(text) {
    const trimmed = String(text || '').trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
      throw new Error('Remote AI response was not valid JSON.');
    }
  }

  async analyze(payload) {
    const settings = payload.settings || this.loadSettings();
    if (!this.isConfigured(settings)) return null;

    try {
      const instructions = this.buildInstructions(payload);
      const text = await this.callProvider(settings, instructions);
      const parsed = this.extractJson(text);
      return {
        ...this.normalizeReport(parsed),
        sourceLabel: `Source: ${settings.provider} ${settings.model}`,
        provider: settings.provider,
        model: settings.model
      };
    } catch (error) {
      console.error('Remote AI analysis failed:', error);
      return {
        report: null,
        sourceLabel: 'Source: Local heuristic AI (remote fallback)',
        provider: settings.provider,
        model: settings.model,
        error: error.message
      };
    }
  }

  async testConnection(settings) {
    if (!this.isConfigured(settings)) {
      return { ok: false, message: 'Provider settings are incomplete.' };
    }
    try {
      const text = await this.callProvider(settings, 'Return only this JSON: {"summary":"ok","topPriority":[],"quickWins":[],"smartSuggestions":[],"incidents":[]}');
      this.extractJson(text);
      return { ok: true, message: `Connected to ${settings.provider} ${settings.model}` };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async callProvider(settings, instructions) {
    switch (settings.provider) {
      case 'openai':
        return this.callOpenAI(settings, instructions);
      case 'gemini':
        return this.callGemini(settings, instructions);
      case 'anthropic':
        return this.callAnthropic(settings, instructions);
      case 'ollama':
        return this.callOllama(settings, instructions);
      default:
        throw new Error('Unsupported AI provider.');
    }
  }

  async callOpenAI(settings, instructions) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You return JSON only.' },
          { role: 'user', content: instructions }
        ]
      })
    });
    if (!response.ok) throw new Error(`OpenAI request failed with ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async callGemini(settings, instructions) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instructions }] }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });
    if (!response.ok) throw new Error(`Gemini request failed with ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async callAnthropic(settings, instructions) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: instructions }]
      })
    });
    if (!response.ok) throw new Error(`Anthropic request failed with ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  async callOllama(settings, instructions) {
    const base = (settings.endpoint || 'http://localhost:11434').replace(/\/$/, '');
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        prompt: instructions,
        stream: false,
        format: 'json'
      })
    });
    if (!response.ok) throw new Error(`Ollama request failed with ${response.status}`);
    const data = await response.json();
    return data.response || '';
  }
}

export const aiProviderClient = new AIProviderClient();