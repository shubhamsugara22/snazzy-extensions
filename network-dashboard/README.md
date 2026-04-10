# Network Diagnostics Dashboard

Modern Chrome extension for network troubleshooting, performance analysis, and AI-assisted diagnostics.

Current version: 3.0.0

## What It Does

This extension opens a dedicated dashboard for the active tab and helps you investigate:

- network latency,
- Core Web Vitals,
- API bottlenecks,
- third-party impact,
- heavy assets,
- bandwidth usage,
- performance regressions over time.

It combines browser performance data with built-in local AI heuristics and optional bring-your-own AI provider support.

## Key Features

### Performance & Network Analysis

- Core Web Vitals panel:
  - LCP
  - INP
  - CLS
  - FID (legacy)
- Performance score card with visual progress ring
- Navigation timing breakdown:
  - DNS
  - TCP
  - TLS
  - TTFB
  - DOMContentLoaded
  - Load duration
- Resource table with filtering and sorting
- Waterfall chart for resource loading timeline
- Bandwidth and connection quality analysis

### Troubleshooting Modules

- Third-party resource analysis
- Image optimization analysis
- API call analysis
- Historical performance tracking
- Snapshot export and report export

### AI Features

Built-in local AI analysis includes:

- AI summary for the current page
- top priority recommendations
- quick wins
- predicted impact estimates
- smart suggestions
- AI Incident Radar for likely root-cause signals:
  - backend latency spikes
  - upstream API bottlenecks
  - payload-heavy render paths
  - main-thread interaction bottlenecks

### Bring Your Own AI

Users can optionally connect their own model/provider from the dashboard UI.

Supported providers:

- OpenAI
- Gemini
- Anthropic
- Ollama

This is optional. If not configured, the extension uses local heuristic AI only.

## Installation

1. Clone or download this folder.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `network-dashboard` folder.

## Usage

1. Open any normal website.
2. Click the extension icon.
3. The dashboard opens in a new tab.
4. Use the dashboard actions:

- `Collect Network Metrics`
- `Refresh Info`
- `Run Diagnostics`

1. Review:

- performance score
- AI insights
- incident radar
- bandwidth stats
- waterfall timeline
- third-party/API/image analysis

## Optional Remote AI Setup

Inside the AI panel, expand `Bring your own AI model` and configure:

1. provider,
2. model,
3. API key,
4. local Ollama endpoint if needed.

Then:

1. click `Test Connection`,
2. click `Save AI Settings`,
3. run `Collect Network Metrics`.

If remote AI fails, the dashboard automatically falls back to local AI.

## Permissions

### Extension permissions

- `activeTab`: allows one-time access to the current tab after user action
- `scripting`: injects the collector into the active page
- `tabs`: resolves the active tab and URL context

### Host permissions

- `https://api.ipify.org/*`
- `https://dns.google/*`
- `https://api.openai.com/*`
- `https://generativelanguage.googleapis.com/*`
- `https://api.anthropic.com/*`
- `http://localhost:11434/*`
- `http://127.0.0.1:11434/*`

Remote AI endpoints are only used if the user explicitly enables and configures them.

## Architecture

Main files:

- `background.js`: opens the dashboard with active tab context
- `dashboard.html`: dashboard UI
- `dashboard.css`: styling and layout
- `dashboard.js`: orchestration, rendering, exports, diagnostics

Modules:

- `modules/web-vitals.js`
- `modules/performance-score.js`
- `modules/bandwidth-monitor.js`
- `modules/waterfall.js`
- `modules/third-party-analyzer.js`
- `modules/recommendations.js`
- `modules/image-optimizer.js`
- `modules/api-monitor.js`
- `modules/historical-tracker.js`
- `modules/ai-analyzer.js`
- `modules/ai-provider.js`

## Tech Stack

- Vanilla JavaScript
- HTML/CSS
- Chrome Extension Manifest V3
- Browser Performance APIs
- Navigator connection APIs
- Local heuristic AI + optional remote AI provider adapters

## Privacy Notes

- By default, the extension does not send collected metrics to third-party AI services.
- Historical summaries are stored locally in the browser for trend tracking.
- If the user enables a remote AI provider, a summarized diagnostics payload may be sent to that selected provider.

See also:

- `PRIVACY.md`
- `privacy.html`

## Troubleshooting

If metrics do not load:

1. Make sure you launched the dashboard by clicking the extension icon.
2. Use a normal website, not `chrome://` or extension pages.
3. Reload the target page and try again.
4. Open DevTools for the dashboard and check the console.

If remote AI does not work:

1. Verify provider, model, and API key.
2. Use `Test Connection` in the AI settings panel.
3. For Ollama, make sure the local server is running and reachable.
4. The dashboard will continue working with local AI if remote AI fails.

## Latest Additions

- AI Incident Radar
- optional bring-your-own AI provider support
- OpenAI, Gemini, Anthropic, and Ollama adapters
- remote AI test/save workflow
- safer local fallback behavior
- cleaned and stabilized dashboard runtime
