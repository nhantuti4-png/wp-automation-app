
import https from 'https';

// Information gathered so far:
const serviceHash = 'orgfns2iludm3cwyzqqycb';
const projectNum = '827647780631';
const projectID = 'ais-asia-southeast1-d704aaa311'; // from metadata
const projectIDHash = 'd704aaa311';
const region = 'asia-southeast1';
const regionShort = 'as';

const combinations = [
  // Patterns for shared URL (pre)
  `ais-pre-${serviceHash}-${projectNum}.${region}.run.app`,
  `ais-pre-${serviceHash}.${projectIDHash}.${regionShort}.a.run.app`,
  `ais-pre-${serviceHash}.${projectNum}.${regionShort}.a.run.app`,
  `ais-pre-${serviceHash}-${projectIDHash}.${regionShort}.a.run.app`,
  
  // Patterns for dev URL
  `ais-dev-${serviceHash}-${projectNum}.${region}.run.app`,
  `ais-dev-${serviceHash}.${projectIDHash}.${regionShort}.a.run.app`,
  
  // Direct patterns without ais- prefix (often the underlying service)
  `${serviceHash}-${projectNum}.${regionShort}.a.run.app`,
  `${serviceHash}.${projectIDHash}.${regionShort}.a.run.app`,
  `ais-shared-${serviceHash}-${projectNum}.${regionShort}.a.run.app`,
];

async function probe(hostname) {
  return new Promise((resolve) => {
    const url = `https://${hostname}/api/health`;
    console.log(`Probing: ${url}`);
    const req = https.get(url, { timeout: 3000 }, (res) => {
      console.log(`  [${hostname}] STATUS: ${res.statusCode}`);
      console.log(`  [${hostname}] SERVER: ${res.headers.server}`);
      console.log(`  [${hostname}] CONTENT-TYPE: ${res.headers['content-type']}`);
      
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
         console.log(`  [${hostname}] BODY PREVIEW: ${data.slice(0, 100)}`);
         resolve({ hostname, status: res.statusCode, server: res.headers.server, body: data });
      });
    });
    
    req.on('error', (e) => {
      console.log(`  [${hostname}] ERROR: ${e.message}`);
      resolve(null);
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.log(`  [${hostname}] TIMEOUT`);
      resolve(null);
    });
  });
}

(async () => {
  const results = [];
  for (const host of combinations) {
    const res = await probe(host);
    if (res && res.status === 200) {
      console.log(`\n!!! FOUND POTENTIAL DIRECT URL: https://${res.hostname} !!!\n`);
    } else if (res && res.status === 302 && res.body.includes('cookie_check')) {
      console.log(`  [${host}] (Confirmed Proxy URL - requires cookies)`);
    }
  }
})();
