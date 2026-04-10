Network Diagnostics Dashboard — Privacy Policy

Last updated: October 25, 2025

This privacy statement describes what data the Network Diagnostics Dashboard extension may access, how that data is used, and the privacy protections in place.

Summary
- The extension performs only user-initiated, one-time collection of performance and network-related metrics from the active tab when you click the extension and request metrics.
- We do not collect or transmit page content, keystrokes, or personally-identifiable browsing history.
- Some data (public IP) is retrieved from public APIs and therefore the API provider will see the request.

What data the extension may read or obtain (and when)
- Performance timing and resource metadata from the active page (performance.getEntriesByType('resource'|'navigation'|'paint')): resource names (URLs), initiatorType, duration, and size fields. Collected only when you click the extension icon and then click “Collect Network Metrics.”
- Navigator.connection details when available: effectiveType, downlink, rtt, saveData. Collected only on user request.
- Public IP lookup: optionally requests a public IP from a public service (api.ipify.org) to show your public IP for diagnostics — this request is sent to a third-party API and will reveal your public IP to that service.
- DNS resolution for a host: optionally queries public DNS over HTTPS (dns.google) to look up server IP addresses for a hostname when running diagnostics.
- Diagnostics fetch results: when you use the Diagnostics tool to fetch a URL, the extension performs a fetch from the dashboard page to that URL; the response status, timing, and optional payload size may be used to build a diagnostics summary. The payload is not uploaded elsewhere by the extension.

How data is used
- All collected metrics are used to create a concise diagnostics summary in your browser UI so you can triage network and performance issues.
- The extension does not send collected performance metrics, resource URLs, or navigation data to any third-party servers or services by default.
- The only network calls made by the extension are:
  - Public IP lookup (api.ipify.org) — exposes the requester's public IP to that provider.
  - DNS resolution via dns.google — resolves hostnames to IPs using a public DNS over HTTPS provider.
  - Any Diagnostics fetch you explicitly run — your browser performs the fetch to the specified endpoint.
- If you explicitly enable a user-supplied AI provider in the dashboard settings, the extension may send a summarized performance payload to that provider for advanced analysis. This feature is optional and disabled by default.

Storage and retention
- The extension stores historical performance summaries locally in your browser (localStorage) for trend tracking and export features.
- This local history remains on your device until you clear it from the dashboard using "Clear History."
- The extension does not upload this history to any cloud service.

Sharing and third parties
- The extension does not upload or share page content or collected timing data to third parties.
- Third-party services contacted (api.ipify.org, dns.google) will receive standard HTTP requests; see their respective privacy policies for details.
- If you configure OpenAI, Gemini, Anthropic, or Ollama, that selected provider will receive the summarized diagnostics payload needed to generate the AI response.

Security
- The extension injects only a small, temporary collector function into the active tab to read performance APIs. The injected code does not modify the page or persist scripts.
- No remote JavaScript or WebAssembly is loaded; all executable code is packaged with the extension.

Permissions rationale (brief)
- activeTab — allows a one-time injection into the active tab only when you click the extension so the extension can read the page’s Performance API.
- scripting — used to inject a small collector function into the active tab; the injected function returns a minimal JSON payload of metrics.
- tabs — used only to resolve the active tab’s hostname for optional server IP resolution. (If you prefer, this can be removed to reduce permissions; the extension can rely on the activeTab-provided tab object.)

Your choices and controls
- You control when data is collected: click the extension icon and press "Collect Network Metrics" to collect metrics. No automatic or background collection occurs.
- Do not use the public-IP or DNS features if you wish to avoid third-party requests — these features are optional and used only for convenience.

Contact
If you have questions about this privacy policy or want the extension to support an explicit data-sharing opt-in or data export feature, open an issue in the repository or contact the maintainer at: 

  maintainer@example.com

Changes to this policy
We may update this policy to reflect changes to the extension. When significant changes are made, we will update the "Last updated" date at the top of this file.
