
import https from 'https';

const combinations = [
  'ais-dev-orgfns2iludm3cwyzqqycb-d704aaa311-as.a.run.app',
  'ais-pre-orgfns2iludm3cwyzqqycb-d704aaa311-as.a.run.app',
  'orgfns2iludm3cwyzqqycb-d704aaa311-as.a.run.app',
  'ais-dev-orgfns2iludm3cwyzqqycb-d704aaa311.as.a.run.app',
  'ais-pre-orgfns2iludm3cwyzqqycb-d704aaa311.as.a.run.app',
  
  // Try with project number
  'ais-dev-orgfns2iludm3cwyzqqycb-827647780631-as.a.run.app',
  'ais-pre-orgfns2iludm3cwyzqqycb-827647780631-as.a.run.app',
  
  // Without ais-dev/pre prefix
  'orgfns2iludm3cwyzqqycb-827647780631-as.a.run.app'
];

async function probe(host) {
  return new Promise((resolve) => {
    const url = `https://${host}/api/health`;
    console.log(`Probing: ${url}`);
    const req = https.get(url, { timeout: 3000 }, (res) => {
      console.log(`  [${host}] STATUS: ${res.statusCode} | SERVER: ${res.headers.server}`);
      resolve(res.statusCode);
    }).on('error', (e) => {
      console.log(`  [${host}] ERROR: ${e.message}`);
      resolve(null);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

(async () => {
  for (const h of combinations) {
    await probe(h);
  }
})();
