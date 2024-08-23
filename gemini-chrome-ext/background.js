// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'people_joined') {
      console.log('Received message from content script:', request);
      sendNotification(`${request.name} has joined the call!`); 
      sendResponse({ success: true }); 
    }
  });
  
  function sendNotification(message) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'success.png', // Replace with your notification icon
      title: 'Google Meet Notification',
      message: message, // Use the message argument here
    }, (notificationId) => {
      console.log('Notification created with ID:', notificationId);
    });
  }

  