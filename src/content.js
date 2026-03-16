chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_PAGE') {
    try {
      const bodyText = document.body ? document.body.innerText : '';
      const bodyHtml = document.body ? document.body.innerHTML : '';
      sendResponse({
        success: true,
        text: bodyText,
        html: bodyHtml,
        url: window.location.href,
        title: document.title,
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});

console.log('Lead Extractor Pro: Content script ready.');
