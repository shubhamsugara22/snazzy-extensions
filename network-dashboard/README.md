# Network Diagnostics Dashboard Extension

A Chrome extension that provides detailed network metrics, resource timing, and diagnostics information for web pages.

## Features

- 📊 Network Resource Metrics
  - Resource timing for all page assets (scripts, styles, images, etc.)
  - Transfer size, encoding stats, and load duration
  - Connection info (RTT, downlink, connection type)
  - Navigation timing metrics
  
- 🔍 Network Diagnostics
  - Public IP detection
  - DNS resolution checks
  - Response time testing
  - Server IP lookup

## Installation

1. Clone or download this folder
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this folder
5. The extension icon should appear in your toolbar

## Usage

1. Navigate to any webpage you want to analyze
2. Click the extension icon in your toolbar
   - This opens the dashboard and grants necessary tab access
3. In the dashboard:
   - Click "Collect Network Metrics" to see detailed resource timings
   - Click "Run Diagnostics" to test connectivity
   - Click "Refresh Info" to update IP/DNS information
   - Use the tabs to switch between Network Info, Tools, and About

## Technical Details

- Uses Chrome's `scripting` and `activeTab` permissions
- Collects metrics via Performance API and Navigator interface
- Implements resource timing collection via content script injection
- Responsive design supporting wide metric tables

## Permissions

- `activeTab`: Required to collect metrics from the current page
- `scripting`: Used to inject the metrics collector
- `tabs`: Used to get tab URLs and manage dashboard

## Development

- Built with vanilla JavaScript, HTML, and CSS
- Uses Chrome Extensions Manifest V3
- Implements modern web APIs:
  - Performance API for resource/navigation timing
  - Navigator.connection for network info
  - Chrome Extension APIs for tab management

## Troubleshooting

- If metrics don't appear, ensure:
  1. You opened the dashboard by clicking the extension icon
  2. The target page is a normal webpage (not chrome:// or extension pages)
  3. Your browser supports the Performance API
- Check the console in devtools for detailed error messages
- The "Refresh Info" button can help if IP/DNS lookups initially fail