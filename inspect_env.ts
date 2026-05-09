
import { execSync } from 'child_process';

console.log("=== Environment Inspection ===");
const env = process.env;
for (const key in env) {
  if (key.toLowerCase().includes('url') || key.toLowerCase().includes('host') || key.toLowerCase().includes('service')) {
    console.log(`${key}: ${env[key]}`);
  }
}

try {
  console.log("\n=== Checking Metadata Server ===");
  // Cloud Run provides a metadata server
  const serviceUrl = execSync('curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=[AUDIENCE] || echo "Fail"').toString();
  console.log("Identity Sample:", serviceUrl);
} catch (e) {}

try {
  console.log("\n=== Checking Network Interface ===");
  const ip = execSync('hostname -I').toString();
  console.log("IP Addresses:", ip);
} catch (e) {}
