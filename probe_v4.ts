
import https from 'https';

const serviceHash = 'orgfns2iludm3cwyzqqycb';
const projectIDHash = 'd704aaa311';
const projectNum = '827647780631';

const regions = ['as', 'asia-southeast1'];

async function probe(url) {
  return new Promise((resolve) => {
    console.log(`Checking ${url}...`);
    const req = https.get(url, { timeout: 2000 }, (res) => {
      console.log(`  -> Status: ${res.statusCode} | Server: ${res.headers.server}`);
      resolve(res.statusCode === 200 || res.statusCode === 302);
    }).on('error', (e) => {
      console.log(`  -> Error: ${e.message}`);
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  const serviceNames = [
    `ais-pre-${serviceHash}`,
    `ais-dev-${serviceHash}`,
    `ais-${serviceHash}`,
    `${serviceHash}`
  ];
  
  const hashes = [projectIDHash, projectNum];
  
  for (const svc of serviceNames) {
    for (const h of hashes) {
       for (const r of regions) {
          const url = `https://${svc}-${h}.${r}.run.app/api/health`;
          await probe(url);
       }
    }
  }
})();
