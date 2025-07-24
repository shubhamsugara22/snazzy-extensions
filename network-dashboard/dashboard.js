// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Helper functions
async function getPublicIp() {
  const res = await fetch('https://api.ipify.org?format=json');
  const data = await res.json();
  return data.ip;
}

async function getServerIp(domain) {
  const res = await fetch(`https://dns.google/resolve?name=${domain}`);
  const data = await res.json();
  if (data.Answer && data.Answer.length > 0) {
    const answer = data.Answer.find(a => a.type === 1);
    return answer ? answer.data : 'Not found';
  }
  return 'Not found';
}

// Show network info (using current site, e.g., google.com fallback)
async function showNetworkInfo() {
  let domain = "www.google.com"; // fallback if tabs API isn't available
  // Try getting active tab domain
  if (chrome && chrome.tabs) {
    try {
      const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      domain = new URL(tab.url).hostname;
    } catch { /* fallback to google.com */ }
  }
  const publicIp = await getPublicIp();
  const serverIp = await getServerIp(domain);
  document.getElementById('network-details').innerHTML = `
    <strong>Your Public IP:</strong> ${publicIp}<br>
    <strong>Current Domain:</strong> ${domain}<br>
    <strong>Server IP:</strong> ${serverIp}<br>
  `;
}
showNetworkInfo();

// Diagnostics button logic (ping google.com or allow user custom input)
document.getElementById('runDiag').onclick = async () => {
  const endpoint = "https://www.google.com";
  const t0 = performance.now();
  let status;
  try {
    const resp = await fetch(endpoint);
    status = resp.status;
  } catch {
    status = 'error';
  }
  const t1 = performance.now();
  document.getElementById('diagResult').innerHTML = `
    <strong>Test URL:</strong> ${endpoint}<br>
    <strong>Status:</strong> ${status}<br>
    <strong>Response Time:</strong> ${(t1 - t0).toFixed(2)} ms<br>
  `;
};
