
import http from 'http';

const test = (path) => {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        console.log(`PATH: ${path} | STATUS: ${res.statusCode} | BODY: ${data.slice(0, 50)}`);
        resolve(res.statusCode);
      });
    }).on('error', (e) => {
      console.log(`PATH: ${path} | ERROR: ${e.message}`);
      resolve(null);
    });
  });
};

(async () => {
  await test('/status');
  await test('/api/status');
  await test('/api/local-agent/status');
  await test('/api/health');
})();
