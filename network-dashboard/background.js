// When the extension button is clicked we capture the active tab id
// and open the dashboard, passing the tabId so the dashboard can
// inject a collector script into that tab (uses activeTab permission).
chrome.action.onClicked.addListener((tab) => {
  try {
    const url = chrome.runtime.getURL('dashboard.html') + `?tabId=${tab && tab.id ? tab.id : ''}`;
    chrome.tabs.create({ url });
  } catch (err) {
    // Fallback: open dashboard without tab id
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});
