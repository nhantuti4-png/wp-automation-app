const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = 3001;
const CONFIG_PATH = path.join(__dirname, 'local-bridge.json');

/**
 * Kill any existing ngrok processes to avoid conflict
 */
function killExistingNgrok() {
    try {
        console.log('[NGROK] Killing existing ngrok processes...');
        if (process.platform === 'win32') {
            execSync('taskkill /F /IM ngrok.exe', { stdio: 'ignore' });
        } else {
            execSync('pkill -9 ngrok', { stdio: 'ignore' });
        }
    } catch (e) {
        // Ignore errors if no process is running
    }
}

/**
 * Verify local agent is alive on 3001
 */
async function checkLocalAgent() {
    try {
        const res = await axios.get(`http://localhost:${PORT}/health`, { timeout: 2000 });
        return res.data && res.data.status === 'online';
    } catch (e) {
        return false;
    }
}

/**
 * Get tunnel URL from ngrok local API
 */
async function getNgrokPublicUrl() {
    try {
        const response = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 2000 });
        const tunnel = response.data.tunnels.find(t => (t.proto === 'https' || t.public_url.startsWith('https')));
        return tunnel ? tunnel.public_url : null;
    } catch (e) {
        return null;
    }
}

/**
 * Verify public URL via health check
 */
async function verifyPublicHealth(url) {
    try {
        const res = await axios.get(`${url}/health`, { 
            headers: { 'ngrok-skip-browser-warning': 'true' },
            timeout: 5000 
        });
        return res.data && res.data.status === 'online';
    } catch (e) {
        return false;
    }
}

async function startNgrokProcess() {
    console.log('[NGROK] Spawning new process...');
    const ngrok = spawn('ngrok', ['http', PORT.toString()], {
        detached: true,
        stdio: 'ignore'
    });
    ngrok.unref();
    return ngrok;
}

async function watchdog() {
    console.log('===================================================');
    console.log('[NGROK] Production Watchdog Active');
    console.log('===================================================');

    while (true) {
        // A. Ensure local agent is alive
        const localAlive = await checkLocalAgent();
        if (!localAlive) {
            console.warn(`[WATCHDOG] Local agent on port ${PORT} is not responding. Waiting...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        // B. Ensure ngrok process/tunnel is responding
        let publicUrl = await getNgrokPublicUrl();
        
        if (!publicUrl) {
            console.log('[NGROK] Tunnel missing or process crashed.');
            killExistingNgrok();
            await new Promise(r => setTimeout(r, 2000));
            await startNgrokProcess();
            await new Promise(r => setTimeout(r, 8000));
            publicUrl = await getNgrokPublicUrl();
        }

        if (publicUrl) {
            // C. Verify public health
            const isPublicHealthy = await verifyPublicHealth(publicUrl);
            
            if (isPublicHealthy) {
                console.log(`[NGROK] Tunnel healthy: ${publicUrl}`);
                
                // D. Write config
                let currentConfig = {};
                try {
                    if (fs.existsSync(CONFIG_PATH)) currentConfig = fs.readJsonSync(CONFIG_PATH);
                } catch(e) {}

                if (currentConfig.bridgeUrl !== publicUrl) {
                    console.log(`[NGROK] New public URL detected. Updating local-bridge.json`);
                    await fs.writeJson(CONFIG_PATH, {
                        bridgeUrl: publicUrl,
                        lastUpdated: new Date().toISOString()
                    }, { spaces: 2 });
                }
            } else {
                console.warn(`[NGROK] Public URL detected but health check failed (ERR_NGROK_3200?). Restarting...`);
                killExistingNgrok();
            }
        }

        // E. Wait 15 seconds
        await new Promise(r => setTimeout(r, 15000));
    }
}

// Initial Cleanup
killExistingNgrok();

// Start
watchdog().catch(err => {
    console.error('[NGROK] Watchdog Fatal Error:', err);
});
