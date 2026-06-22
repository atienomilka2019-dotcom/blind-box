
const http = require('http');
const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join('D:/克劳德 Code', 'blind-box-suite.html'), 'utf-8');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
});
server.listen(8088, () => console.log('Server running on http://localhost:8088'));
