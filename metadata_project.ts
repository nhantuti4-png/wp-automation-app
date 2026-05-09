
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
  console.log("Project ID:", await getMetadata('project/project-id'));
  console.log("Numeric Project ID:", await getMetadata('project/numeric-project-id'));
}

run();
