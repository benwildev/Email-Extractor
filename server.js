const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const HOST = '0.0.0.0';

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath;

  if (req.url === '/' || req.url === '/index.html') {
    filePath = path.join(__dirname, 'ui', 'popup.html');
  } else if (req.url.startsWith('/ui/') || req.url.startsWith('/src/')) {
    filePath = path.join(__dirname, req.url);
  } else {
    const uiPath = path.join(__dirname, 'ui', req.url);
    const rootPath = path.join(__dirname, req.url);
    if (fs.existsSync(uiPath)) {
      filePath = uiPath;
    } else {
      filePath = rootPath;
    }
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Lead Extractor Pro preview running at http://${HOST}:${PORT}`);
});
