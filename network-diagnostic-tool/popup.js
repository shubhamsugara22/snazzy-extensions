// Fetches your public IP address
async function getPublicIp() {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
}

// Resolves domain of the current tab to server IP address
async function getServerIp(domain) {
    // Using Google's DNS-over-HTTPS API for A record lookup
    const res = await fetch(`https://dns.google/resolve?name=${domain}`);
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) {
        const answer = data.Answer.find(a => a.type === 1); // type 1: A record (IPv4)
        return answer ? answer.data : 'Not found';
    }
    return 'Not found';
}

// Measures response time for fetching the current domain root as a simple diagnostic
async function testResponseTime(endpoint) {
    const t0 = performance.now();
    let status;
    try {
        const resp = await fetch(endpoint);
        status = resp.status;
    } catch {
        status = 'error';
    }
    const t1 = performance.now();
    return { time: (t1 - t0).toFixed(2), status };
}

// Main handler for the diagnostics button
document.getElementById('checkBtn').onclick = async () => {
    // Get the current active tab's URL
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        const serverIp = await getServerIp(domain);
        const publicIp = await getPublicIp();
        const diagnostics = await testResponseTime(url.origin);

        document.getElementById('result').innerHTML = `
            <b>Your Public IP:</b> ${publicIp}<br/>
            <b>Current Domain:</b> ${domain}<br/>
            <b>Server IP:</b> ${serverIp}<br/>
            <b>Response Time:</b> ${diagnostics.time} ms<br/>
            <b>Status:</b> ${diagnostics.status}<br/>
        `;
    });
};
