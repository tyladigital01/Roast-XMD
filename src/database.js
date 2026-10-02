const fs = require('fs');
const path = require('path');
const { config } = require('./config');

const filePaths = {
  settings: path.join(config.DATA_DIR, 'settings.json'),
  roasts: path.join(config.DATA_DIR, 'roasts.json'),
  targets: path.join(config.DATA_DIR, 'targets.json'),
  stats: path.join(config.DATA_DIR, 'stats.json')
};

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeParseJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureDataFiles() {
  ensureDirectory(config.DATA_DIR);
  ensureDirectory(config.SESSION_DIR);

  const settings = safeParseJson(filePaths.settings, {
    botName: config.BOT_NAME,
    enabled: false,
    intensity: config.ROAST_INTENSITY || 'medium',
    delay: config.ROAST_DELAY || 3000,
    groupEnabled: false,
    privateEnabled: true,
    ownerId: config.OWNER_ID || '',
    createdAt: Date.now()
  });
  writeJson(filePaths.settings, settings);

  const roasts = safeParseJson(filePaths.roasts, {
    custom: []
  });
  writeJson(filePaths.roasts, roasts);

  const targets = safeParseJson(filePaths.targets, []);
  writeJson(filePaths.targets, targets);

  const stats = safeParseJson(filePaths.stats, {
    startedAt: Date.now(),
    messagesReceived: 0,
    normalRoastsSent: 0,
    roastPlus234RoastsSent: 0,
    commandsProcessed: 0,
    activeTargets: 0,
    uptimeMs: 0
  });
  writeJson(filePaths.stats, stats);
}

function loadSettings() {
  return safeParseJson(filePaths.settings, {
    botName: config.BOT_NAME,
    enabled: false,
    intensity: config.ROAST_INTENSITY || 'medium',
    delay: config.ROAST_DELAY || 3000,
    groupEnabled: false,
    privateEnabled: true,
    ownerId: config.OWNER_ID || '',
    createdAt: Date.now()
  });
}

function saveSettings(settings) {
  writeJson(filePaths.settings, settings);
}

function loadRoasts() {
  return safeParseJson(filePaths.roasts, { custom: [] });
}

function saveRoasts(roasts) {
  writeJson(filePaths.roasts, roasts);
}

function loadTargets() {
  return safeParseJson(filePaths.targets, []);
}

function saveTargets(targets) {
  writeJson(filePaths.targets, targets);
}

function loadStats() {
  return safeParseJson(filePaths.stats, {
    startedAt: Date.now(),
    messagesReceived: 0,
    normalRoastsSent: 0,
    roastPlus234RoastsSent: 0,
    commandsProcessed: 0,
    activeTargets: 0,
    uptimeMs: 0
  });
}

function saveStats(stats) {
  writeJson(filePaths.stats, stats);
}

module.exports = {
  ensureDataFiles,
  loadSettings,
  saveSettings,
  loadRoasts,
  saveRoasts,
  loadTargets,
  saveTargets,
  loadStats,
  saveStats,
  filePaths
};
