const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const projectRoot = path.join(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const sessionDir = path.join(dataDir, 'session');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

const config = {
  BOT_NAME: process.env.BOT_NAME || 'Roast XMD',
  OWNER_ID: String(process.env.OWNER_ID || '').trim(),
  ROAST_DELAY: Number(process.env.ROAST_DELAY || 3000),
  ROAST_INTENSITY: String(process.env.ROAST_INTENSITY || 'medium').toLowerCase(),
  DATA_DIR: dataDir,
  SESSION_DIR: sessionDir,
  PROJECT_ROOT: projectRoot
};

module.exports = { config };
