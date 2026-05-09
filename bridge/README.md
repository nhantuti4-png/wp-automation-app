# Local Persistence Bridge

This agent allows the Cloud App to save data directly to your Windows PC at `C:/Train/`.

## Setup Instructions

1.  **Install Node.js**: Download and install from [nodejs.org](https://nodejs.org/).
2.  **Prepare Folder**: Create the folder `C:\Train` on your computer.
3.  **Run the Bridge**:
    *   Double-click `start-bridge.bat`.
    *   The script will install dependencies and start the server on `http://localhost:3001`.
4.  **Configure Cloud App**:
    *   In the Cloud App Settings, set the **Local Agent URL** to `http://localhost:3001`.
    *   Refresh the page.

## Security
- The agent only listens on `localhost`. External IPs cannot connect.
- No data is sent to third parties; it only facilitates direct communication between your browser and your local drive.
