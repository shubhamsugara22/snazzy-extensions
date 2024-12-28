chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "metrics") {
	  const container = document.getElementById("metrics-container");
	  const { title, url, loadTime, resources } = message.payload;
  
	  container.innerHTML = `
		<p><strong>Title:</strong> ${title}</p>
		<p><strong>URL:</strong> ${url}</p>
		<p><strong>Load Time:</strong> ${loadTime} ms</p>
		<p><strong>Resources:</strong></p>
		<ul>
		  ${resources.map(r => `<li>${r.type}: ${r.name} (${r.size} bytes)</li>`).join('')}
		</ul>
	  `;
	}
  });
  