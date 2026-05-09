import { getDb } from "./src/lib/firebaseAdmin.ts";
import { imageOptimizerWorker } from "./src/lib/imageOptimizerWorker.ts";

console.log("Firebase Admin load: OK");
console.log("Image Optimizer Worker lead: OK");
process.exit(0);
