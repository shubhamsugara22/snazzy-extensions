const { type } = require("express/lib/response");

const metrics = {
	title: document.title,
	url: window.location.href,
	loadTime: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
	resources: performance.getEntriesByType('resource').map(resource => ({
		name: resource.name,
		type: resource.intiatorType,
		size: resource.trasferSize
	}))
};

chrome.runtime.sendMessage({type: "metrics", payload: metrics });
console.log("Content script loaded");

  
