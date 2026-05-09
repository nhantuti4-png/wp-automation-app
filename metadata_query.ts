
import http from 'http';

function getMetadata(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'metadata.google.internal',
      path: `/computeMetadata/v1/${path}`,
      headers: {
        'Metadata-Flavor': 'Google'
      }
    };

    http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else resolve(`Error ${res.statusCode}`);
      });
    }).on('error', (err) => {
      resolve(`Error: ${err.message}`);
    });
  });
}

async function run() {
  console.log("Region:", await getMetadata('instance/region'));
  console.log("Attributes:", await getMetadata('instance/attributes/'));
  // Try to find if there is a specific URL attribute
  const attributes = await getMetadata('instance/attributes/');
  if (typeof attributes === 'string' && !attributes.startsWith('Error')) {
     const attrList = attributes.split('\n').filter(Boolean);
     for (const attr of attrList) {
       console.log(`Attr ${attr}:`, await getMetadata(`instance/attributes/${attr}`));
     }
  }
}

run();
