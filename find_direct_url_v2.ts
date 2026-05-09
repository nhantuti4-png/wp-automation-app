
import https from 'https';

const serviceNameDev = 'ais-dev-orgfns2iludm3cwyzqqycb';
const serviceNamePre = 'ais-pre-orgfns2iludm3cwyzqqycb';
const projectHash = 'd704aaa311';

// Cloud Run region codes:
// asia-southeast1 -> as
// us-central1 -> uc
const regions = ['as', 'asia-southeast1'];

const urls = [
  `https://${serviceNamePre}-${projectHash}-as.a.run.app/api/health`,
  `https://${serviceNamePre}-${projectHash}-asia-southeast1.a.run.app/api/health`,
  `https://${serviceNamePre}-${projectHash}.a.run.app/api/health`,
  `https://${serviceNamePre}.${projectHash}.as.a.run.app/api/health`,
  `https://${serviceNamePre}-827647780631-as.a.run.app/api/health`,
];

async function check(url) {
  return new Promise((resolve) => {
    console.log("Checking:", url);
    const req = https.get(url, (res) => {
      console.log(`  Code: ${res.statusCode}`);
      console.log(`  Server: ${res.headers.server}`);
      resolve(res.statusCode);
    });
    req.on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve(null);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

(async () => {
  for (const url of urls) {
    await check(url);
  }
})();
