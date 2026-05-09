
import https from 'https';

const url = 'https://ais-pre-orgfns2iludm3cwyzqqycb-827647780631.asia-southeast1.run.app/api/health';

console.log("Checking URL:", url);

https.get(url, (res) => {
  console.log("Status Code:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Body Preview:", data.slice(0, 500));
  });
}).on('error', (e) => {
  console.error(e);
});
