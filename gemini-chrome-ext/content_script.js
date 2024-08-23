//console.log("Hello Gemini!");
function checkJoinees(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // A child node was added or removed.
        if (document.querySelector('div.dX7bRc') && document.querySelector('div.dX7bRc').childElementCount > 0) {
          // div.dX7bRc has at least one child element.
            const name = document.querySelector('div.dX7bRc > img').getAttribute('title');
            sendMessage(name);
            console.log('div.dX7bRc has at least one child element.');
        }
      }
    }
    return false;
}
const observer = new MutationObserver(checkJoinees);
observer.observe(document.body, {
  childList: true,
  delay: 1000
});
function sendMessage(name) {
    const joinee = (name === null ? 'Someone' : name),
        txt = `${joinee} has joined the call!`;

    chrome.runtime.sendMessage({
        name: joinee,
        action: "people_joined",
    });
}


