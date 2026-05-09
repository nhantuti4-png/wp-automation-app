
import https from 'https';

const serviceNameDev = 'ais-dev-orgfns2iludm3cwyzqqycb';
const serviceNamePre = 'ais-pre-orgfns2iludm3cwyzqqycb';
const projectHash = '827647780631'; // This is in the metadata URL
const projectIDAlt = 'd704aaa311'; // This was in the service account

const regions = ['asia-southeast1', 'as'];

const urls = [
  `https://${serviceNameDev}-${projectHash}.${regions[0]}.run.app/api/health`,
  `https://${serviceNamePre}-${projectHash}.${regions[0]}.run.app/api/health`,
  `https://${serviceNameDev}-${projectIDAlt}-as.a.run.app/api/health`,
  `https://${serviceNamePre}-${projectIDAlt}-as.a.run.app/api/health`,
  `https://${serviceNameDev}-${projectIDAlt}.as.a.run.app/api/health`,
];

async function check(url) {
  return new Promise((resolve) => {
    console.log("Checking:", url);
    const req = https.get(url, (res) => {
      console.log(`  Code: ${res.statusCode}`);
      console.log(`  Server: ${res.headers.server}`);
      console.log(`  Location: ${res.headers.location || 'none'}`);
      resolve(res.statusCode);
    });
    req.on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve(null);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      console.log(`  Timeout`);
      resolve(null);
    });
  });
}

(async () => {
  for (const url of urls) {
    await check(url);
  }
})();
