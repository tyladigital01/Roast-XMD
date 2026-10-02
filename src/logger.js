const { config } = require('./config');
const { logger } = require('./logger');
const { loadSettings, saveSettings, loadTargets, saveTargets, loadStats, saveStats, loadRoasts, saveRoasts } = require('./database');
const { chooseRoastCategory, getRoastTextForMessage, normalizePhoneNumber, buildTargetJid, normalizeJid } = require('./roasts');

const commandKeywords = new Set(['menu', 'help', 'ping', 'status', 'stats', 'roast', 'group', 'private', 'add', 'delete', 'set', 'restart']);

function normalizeCommandText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function isLikelyCommandText(rawText) {
  const text = normalizeCommandText(rawText).toLowerCase();
  if (!text) return false;
  if (text === 'menu' || text === 'help' || text === 'ping' || text === 'status' || text === 'stats') return true;
  if (text.startsWith('roast ')) return true;
  if (text.startsWith('group ')) return true;
  if (text.startsWith('private ')) return true;
  if (text.startsWith('add roast ')) return true;
  if (text.startsWith('delete roast ')) return true;
  if (text.startsWith('set delay ')) return true;
  if (text === 'restart') return true;
  return false;
}

function commandResponseMenu() {
  return `🔥 ROAST XMD 🔥\n\n━━━━━━━━━━━━━━━━━━\nGENERAL\n• menu\n• help\n• ping\n• status\n• stats\n\nROAST\n• roast on\n• roast off\n• roast easy\n• roast medium\n• roast hardcore\n\nROAST +234\n• roast +234 add <number> easy\n• roast +234 add <number> medium\n• roast +234 add <number> hardcore\n• roast +234 list\n• roast +234 status <number>\n• roast +234 change <number> <mode>\n• roast +234 stop <number>\n• roast +234 remove <number>\n\nOWNER\n• set delay\n• add roast\n• delete roast\n• group on\n• group off\n• private on\n• private off\n• restart\n\n━━━━━━━━━━━━━━━━━━\n🔥 ROAST XMD\nYou message. I roast. 💀`;
}

function isOwner(senderValue) {
  const ownerId = String(config.OWNER_ID || '').trim();
  if (!ownerId) return false;
  const normalizedOwner = normalizeJid(ownerId).replace(/^234/, '234');
  const normalizedSender = normalizeJid(senderValue);
  return normalizedSender === normalizedOwner || String(senderValue || '').includes(ownerId);
}

function parseTargetCommand(text) {
  const lower = normalizeCommandText(text).toLowerCase();
  const match = lower.match(/^roast\s+\+?234\s+(add|remove|list|status|stop|start|change)\b(?:\s+(.*))?$/i);
  if (!match) return null;
  const action = match[1].toLowerCase();
  const tail = (match[2] || '').trim();
  return { action, tail };
}

function parseRoastMode(value) {
  const mode = String(value || '').toLowerCase();
  if (['easy', 'medium', 'hardcore'].includes(mode)) return mode;
  return null;
}

function parseRoastSettingsCommand(text) {
  const cleaned = normalizeCommandText(text).toLowerCase();
  const match = cleaned.match(/^roast\s+(on|off|easy|medium|hardcore)$/i);
  if (!match) return null;
  return { action: match[1].toLowerCase() };
}

function parseCommand(rawText) {
  const text = normalizeCommandText(rawText);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === 'menu' || lower === 'help') return { type: 'menu' };
  if (lower === 'ping') return { type: 'ping' };
  if (lower === 'status') return { type: 'status' };
  if (lower === 'stats') return { type: 'stats' };
  if (lower === 'restart') return { type: 'restart' };

  const roastSettingsCommand = parseRoastSettingsCommand(lower);
  if (roastSettingsCommand) return { type: 'roast-settings', ...roastSettingsCommand };

  const targetCommand = parseTargetCommand(lower);
  if (targetCommand) return { type: 'target', ...targetCommand };

  const groupSetting = lower.match(/^group\s+(on|off)$/i);
  if (groupSetting) return { type: 'group-setting', action: groupSetting[1].toLowerCase() };

  const privateSetting = lower.match(/^private\s+(on|off)$/i);
  if (privateSetting) return { type: 'private-setting', action: privateSetting[1].toLowerCase() };

  const addCustom = lower.match(/^add\s+roast\s+(.+)$/i);
  if (addCustom) return { type: 'add-roast', text: addCustom[1].trim() };

  const deleteCustom = lower.match(/^delete\s+roast\s+(\d+)$/i);
  if (deleteCustom) return { type: 'delete-roast', id: Number(deleteCustom[1]) };

  const setDelay = lower.match(/^set\s+delay\s+(\d+)$/i);
  if (setDelay) return { type: 'set-delay', delay: Number(setDelay[1]) };

  return null;
}

async function handleCommand(socket, message, senderJid, commandText) {
  const text = normalizeCommandText(commandText);
  const command = parseCommand(text);
  if (!command) return null;

  const settings = loadSettings();
  const stats = loadStats();
  stats.commandsProcessed = (stats.commandsProcessed || 0) + 1;
  saveStats(stats);

  if (command.type !== 'menu' && command.type !== 'help' && command.type !== 'ping' && command.type !== 'status' && command.type !== 'stats' && !isOwner(senderJid)) {
    await socket.sendMessage(senderJid, { text: 'Permission denied. Only the owner can use Roast XMD admin commands.' });
    return true;
  }

  if (command.type === 'menu' || command.type === 'help') {
    await socket.sendMessage(senderJid, { text: commandResponseMenu() });
    return true;
  }

  if (command.type === 'ping') {
    await socket.sendMessage(senderJid, { text: 'Pong! Roast XMD is online and ready.' });
    return true;
  }

  if (command.type === 'status') {
    const remaining = settings.enabled ? 'Enabled' : 'Disabled';
    const mode = settings.intensity || 'medium';
    const msg = `Roast XMD status\n• Engine: ${remaining}\n• Intensity: ${mode}\n• Group auto-roast: ${settings.groupEnabled ? 'ON' : 'OFF'}\n• Private auto-roast: ${settings.privateEnabled ? 'ON' : 'OFF'}\n• Delay: ${settings.delay || 3000}ms`;
    await socket.sendMessage(senderJid, { text: msg });
    return true;
  }

  if (command.type === 'stats') {
    const statsData = loadStats();
    const msg = `Roast XMD Stats\n• Messages received: ${statsData.messagesReceived || 0}\n• Normal roasts: ${statsData.normalRoastsSent || 0}\n• Roast +234 roasts: ${statsData.roastPlus234RoastsSent || 0}\n• Commands: ${statsData.commandsProcessed || 0}\n• Active targets: ${statsData.activeTargets || 0}`;
    await socket.sendMessage(senderJid, { text: msg });
    return true;
  }

  if (command.type === 'roast-settings') {
    if (command.action === 'on') {
      settings.enabled = true;
      saveSettings(settings);
      await socket.sendMessage(senderJid, { text: 'Roast engine enabled.' });
    }
    if (command.action === 'off') {
      settings.enabled = false;
      saveSettings(settings);
      await socket.sendMessage(senderJid, { text: 'Roast engine disabled.' });
    }
    if (command.action === 'easy') {
      settings.intensity = 'easy';
      saveSettings(settings);
      await socket.sendMessage(senderJid, { text: 'Roast intensity set to easy.' });
    }
    if (command.action === 'medium') {
      settings.intensity = 'medium';
      saveSettings(settings);
      await socket.sendMessage(senderJid, { text: 'Roast intensity set to medium.' });
    }
    if (command.action === 'hardcore') {
      settings.intensity = 'hardcore';
      saveSettings(settings);
      await socket.sendMessage(senderJid, { text: 'Roast intensity set to hardcore.' });
    }
    return true;
  }

  if (command.type === 'group-setting') {
    settings.groupEnabled = command.action === 'on';
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Group auto-roast ${command.action === 'on' ? 'enabled' : 'disabled'}.` });
    return true;
  }

  if (command.type === 'private-setting') {
    settings.privateEnabled = command.action === 'on';
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Private auto-roast ${command.action === 'on' ? 'enabled' : 'disabled'}.` });
    return true;
  }

  if (command.type === 'set-delay') {
    settings.delay = Number(command.delay) || 3000;
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Delay set to ${settings.delay}ms.` });
    return true;
  }

  if (command.type === 'add-roast') {
    const roasts = loadRoasts();
    const roastText = String(command.text || '').trim();
    if (!roastText) {
      await socket.sendMessage(senderJid, { text: 'Add roast requires text.' });
      return true;
    }
    const item = {
      id: Date.now(),
      text: roastText,
      category: 'general',
      intensity: 'medium',
      createdAt: Date.now()
    };
    roasts.custom.push(item);
    saveRoasts(roasts);
    await socket.sendMessage(senderJid, { text: `Custom roast added with id ${item.id}.` });
    return true;
  }

  if (command.type === 'delete-roast') {
    const roasts = loadRoasts();
    const before = roasts.custom.length;
    roasts.custom = roasts.custom.filter((item) => Number(item.id) !== Number(command.id));
    saveRoasts(roasts);
    await socket.sendMessage(senderJid, { text: `Delete complete. Removed ${before - roasts.custom.length} custom roast(s).` });
    return true;
  }

  if (command.type === 'restart') {
    await socket.sendMessage(senderJid, { text: 'Restart requested. Shutting down...' });
    setTimeout(() => process.exit(0), 500);
    return true;
  }

  if (command.type === 'target') {
    const targets = loadTargets();
    const action = command.action;

    if (action === 'list') {
      if (!targets.length) {
        await socket.sendMessage(senderJid, { text: 'No Roast +234 targets saved yet.' });
        return true;
      }
      const response = targets.map((target) => `${target.number} | ${target.enabled ? 'ON' : 'OFF'} | ${target.mode || 'medium'} | ${target.optOut ? 'OPTED OUT' : 'ACTIVE'}`).join('\n');
      await socket.sendMessage(senderJid, { text: `Roast +234 targets:\n${response}` });
      return true;
    }

    if (action === 'add') {
      const parts = command.tail.split(/\s+/);
      const rawNumber = parts[0];
      const mode = parseRoastMode(parts[1]);
      if (!rawNumber || !mode) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 add <number> easy|medium|hardcore' });
        return true;
      }
      const number = normalizePhoneNumber(rawNumber);
      if (!number) {
        await socket.sendMessage(senderJid, { text: 'Invalid number format.' });
        return true;
      }
      const existing = targets.find((target) => target.number === number);
      if (existing) {
        existing.enabled = true;
        existing.mode = mode;
        existing.cooldownMs = existing.cooldownMs || settings.delay || 3000;
        existing.optOut = false;
        saveTargets(targets);
        await socket.sendMessage(senderJid, { text: `Target ${number} updated to ${mode}.` });
        return true;
      }
      targets.push({
        id: Date.now(),
        number,
        enabled: true,
        mode,
        cooldownMs: settings.delay || 3000,
        lastResponseAt: 0,
        optOut: false,
        stats: { roastsSent: 0 }
      });
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${number} added in ${mode} mode.` });
      return true;
    }

    if (action === 'remove') {
      const rawNumber = (command.tail || '').split(/\s+/)[0];
      const number = normalizePhoneNumber(rawNumber);
      if (!number) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 remove <number>' });
        return true;
      }
      const nextTargets = targets.filter((target) => target.number !== number);
      saveTargets(nextTargets);
      await socket.sendMessage(senderJid, { text: `Target ${number} removed.` });
      return true;
    }

    if (action === 'stop' || action === 'start') {
      const rawNumber = (command.tail || '').split(/\s+/)[0];
      const number = normalizePhoneNumber(rawNumber);
      if (!number) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 stop <number>' });
        return true;
      }
      const target = targets.find((item) => item.number === number);
      if (!target) {
        await socket.sendMessage(senderJid, { text: `Target ${number} not found.` });
        return true;
      }
      target.enabled = action === 'start';
      target.optOut = false;
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${number} ${action === 'start' ? 'started' : 'stopped'}.` });
      return true;
    }

    if (action === 'change') {
      const parts = command.tail.split(/\s+/);
      const rawNumber = parts[0];
      const mode = parseRoastMode(parts[1]);
      if (!rawNumber || !mode) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 change <number> easy|medium|hardcore' });
        return true;
      }
      const number = normalizePhoneNumber(rawNumber);
      const target = targets.find((item) => item.number === number);
      if (!target) {
        await socket.sendMessage(senderJid, { text: `Target ${number} not found.` });
        return true;
      }
      target.mode = mode;
      target.enabled = true;
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${number} changed to ${mode}.` });
      return true;
    }

    if (action === 'status') {
      const rawNumber = (command.tail || '').split(/\s+/)[0];
      const number = normalizePhoneNumber(rawNumber);
      const target = targets.find((item) => item.number === number);
      if (!target) {
        await socket.sendMessage(senderJid, { text: `Target ${number || rawNumber} not found.` });
        return true;
      }
      const message = `Target ${target.number}\n• Enabled: ${target.enabled ? 'YES' : 'NO'}\n• Mode: ${target.mode || 'medium'}\n• Cooldown: ${target.cooldownMs || settings.delay || 3000}ms\n• Opt-out: ${target.optOut ? 'YES' : 'NO'}`;
      await socket.sendMessage(senderJid, { text: message });
      return true;
    }
  }

  return false;
}

module.exports = {
  isLikelyCommandText,
  handleCommand,
  commandResponseMenu,
  parseCommand,
  normalizeCommandText,
  isOwner
};
