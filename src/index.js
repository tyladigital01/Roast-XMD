const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { logger } = require('../logger');
const { loadSettings, saveSettings, loadTargets, saveTargets, loadStats, saveStats, loadRoasts, saveRoasts } = require('../database');
const { chooseRoastCategory, getRoastTextForMessage, normalizePhoneNumber, normalizeJid, buildTargetJid } = require('../roasts');

function normalizeCommandText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function isLikelyCommandText(rawText) {
  const text = normalizeCommandText(rawText).toLowerCase();
  if (!text) return false;
  if (['menu', 'help', 'ping', 'status', 'stats', 'restart'].includes(text)) return true;
  if (text.startsWith('roast ')) return true;
  if (text.startsWith('group ')) return true;
  if (text.startsWith('private ')) return true;
  if (text.startsWith('add roast ')) return true;
  if (text.startsWith('delete roast ')) return true;
  if (text.startsWith('set delay ')) return true;
  return false;
}

function isOwner(senderValue) {
  const ownerId = String(config.OWNER_ID || '').trim();
  if (!ownerId) return false;
  const normalizedOwner = String(ownerId).replace(/\D/g, '');
  const normalizedSender = String(senderValue || '').replace(/\D/g, '');
  return normalizedSender === normalizedOwner || String(senderValue || '').includes(ownerId);
}

function commandResponseMenu() {
  return `🔥 ROAST XMD 🔥\n\n━━━━━━━━━━━━━━━━━━\nGENERAL\n• menu\n• help\n• ping\n• status\n• stats\n\nROAST\n• roast on\n• roast off\n• roast easy\n• roast medium\n• roast hardcore\n\nROAST +234\n• roast +234 add <number> easy\n• roast +234 add <number> medium\n• roast +234 add <number> hardcore\n• roast +234 list\n• roast +234 status <number>\n• roast +234 change <number> <mode>\n• roast +234 stop <number>\n• roast +234 remove <number>\n\nOWNER\n• set delay\n• add roast\n• delete roast\n• group on\n• group off\n• private on\n• private off\n• restart\n\n━━━━━━━━━━━━━━━━━━\n🔥 ROAST XMD\nYou message. I roast. 💀`;
}

function parseRoastMode(value) {
  const mode = String(value || '').toLowerCase();
  if (['easy', 'medium', 'hardcore'].includes(mode)) return mode;
  return null;
}

function parseCommand(text) {
  const lower = normalizeCommandText(text).toLowerCase();
  if (!lower) return null;

  if (['menu', 'help'].includes(lower)) return { type: 'menu' };
  if (lower === 'ping') return { type: 'ping' };
  if (lower === 'status') return { type: 'status' };
  if (lower === 'stats') return { type: 'stats' };
  if (lower === 'restart') return { type: 'restart' };

  const roastSettings = lower.match(/^roast\s+(on|off|easy|medium|hardcore)$/i);
  if (roastSettings) return { type: 'roast-settings', action: roastSettings[1].toLowerCase() };

  const groupSetting = lower.match(/^group\s+(on|off)$/i);
  if (groupSetting) return { type: 'group-setting', action: groupSetting[1].toLowerCase() };

  const privateSetting = lower.match(/^private\s+(on|off)$/i);
  if (privateSetting) return { type: 'private-setting', action: privateSetting[1].toLowerCase() };

  const targetCommand = lower.match(/^roast\s+\+?234\s+(add|remove|list|status|stop|start|change)\s*(.*)$/i);
  if (targetCommand) {
    return { type: 'target', action: targetCommand[1].toLowerCase(), tail: (targetCommand[2] || '').trim() };
  }

  const addCustom = lower.match(/^add\s+roast\s+(.+)$/i);
  if (addCustom) return { type: 'add-roast', text: addCustom[1].trim() };

  const deleteCustom = lower.match(/^delete\s+roast\s+(\d+)$/i);
  if (deleteCustom) return { type: 'delete-roast', id: Number(deleteCustom[1]) };

  const setDelay = lower.match(/^set\s+delay\s+(\d+)$/i);
  if (setDelay) return { type: 'set-delay', delay: Number(setDelay[1]) };

  return null;
}

async function handleCommand(socket, message, senderJid, rawText) {
  const text = normalizeCommandText(rawText);
  const command = parseCommand(text);
  if (!command) return false;

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
    await socket.sendMessage(senderJid, { text: `Roast XMD status\n• Engine: ${settings.enabled ? 'Enabled' : 'Disabled'}\n• Intensity: ${settings.intensity || 'medium'}\n• Delay: ${settings.delay || 3000}ms\n• Group auto-roast: ${settings.groupEnabled ? 'ON' : 'OFF'}\n• Private auto-roast: ${settings.privateEnabled ? 'ON' : 'OFF'}` });
    return true;
  }

  if (command.type === 'stats') {
    const currentStats = loadStats();
    await socket.sendMessage(senderJid, { text: `Roast XMD Stats\n• Messages received: ${currentStats.messagesReceived || 0}\n• Normal roasts: ${currentStats.normalRoastsSent || 0}\n• Roast +234 roasts: ${currentStats.roastPlus234RoastsSent || 0}\n• Commands processed: ${currentStats.commandsProcessed || 0}\n• Active targets: ${currentStats.activeTargets || 0}` });
    return true;
  }

  if (command.type === 'roast-settings') {
    settings.enabled = command.action === 'on';
    if (command.action === 'easy' || command.action === 'medium' || command.action === 'hardcore') {
      settings.intensity = command.action;
      settings.enabled = true;
    }
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Roast engine ${command.action === 'on' ? 'enabled' : command.action === 'off' ? 'disabled' : 'set to ' + command.action + '.'}` });
    return true;
  }

  if (command.type === 'group-setting') {
    settings.groupEnabled = command.action === 'on';
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Group auto-roast ${settings.groupEnabled ? 'enabled' : 'disabled'}.` });
    return true;
  }

  if (command.type === 'private-setting') {
    settings.privateEnabled = command.action === 'on';
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Private auto-roast ${settings.privateEnabled ? 'enabled' : 'disabled'}.` });
    return true;
  }

  if (command.type === 'set-delay') {
    settings.delay = Number(command.delay) || 3000;
    saveSettings(settings);
    await socket.sendMessage(senderJid, { text: `Roast delay set to ${settings.delay}ms.` });
    return true;
  }

  if (command.type === 'add-roast') {
    const roasts = loadRoasts();
    const customText = String(command.text || '').trim();
    if (!customText) {
      await socket.sendMessage(senderJid, { text: 'Usage: add roast <text>' });
      return true;
    }
    roasts.custom = roasts.custom || [];
    roasts.custom.push({ id: Date.now(), text: customText, category: 'general', intensity: settings.intensity || 'medium' });
    saveRoasts(roasts);
    await socket.sendMessage(senderJid, { text: `Custom roast added with id ${roasts.custom[roasts.custom.length - 1].id}.` });
    return true;
  }

  if (command.type === 'delete-roast') {
    const roasts = loadRoasts();
    const before = roasts.custom.length;
    roasts.custom = (roasts.custom || []).filter((item) => Number(item.id) !== Number(command.id));
    saveRoasts(roasts);
    await socket.sendMessage(senderJid, { text: `Deleted ${before - roasts.custom.length} custom roast(s).` });
    return true;
  }

  if (command.type === 'restart') {
    await socket.sendMessage(senderJid, { text: 'Restarting Roast XMD...' });
    setTimeout(() => process.exit(0), 700);
    return true;
  }

  if (command.type === 'target') {
    const targets = loadTargets();
    const action = command.action;

    if (action === 'list') {
      if (!targets.length) {
        await socket.sendMessage(senderJid, { text: 'No Roast +234 targets have been added yet.' });
        return true;
      }
      const response = targets.map((target) => `${target.number} | ${target.mode} | ${target.enabled ? 'ON' : 'OFF'} | ${target.optOut ? 'OPT-OUT' : 'ACTIVE'}`).join('\n');
      await socket.sendMessage(senderJid, { text: `Roast +234 targets:\n${response}` });
      return true;
    }

    if (action === 'add') {
      const parts = (command.tail || '').split(/\s+/);
      const rawNumber = parts[0];
      const mode = parseRoastMode(parts[1]);
      const normalizedNumber = normalizePhoneNumber(rawNumber);
      if (!normalizedNumber || !mode) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 add <number> easy|medium|hardcore' });
        return true;
      }
      const existing = targets.find((target) => target.number === normalizedNumber);
      if (existing) {
        existing.enabled = true;
        existing.mode = mode;
        existing.optOut = false;
        existing.cooldownMs = existing.cooldownMs || settings.delay || 3000;
        saveTargets(targets);
        await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} updated in ${mode} mode.` });
        return true;
      }
      targets.push({
        id: Date.now(),
        number: normalizedNumber,
        enabled: true,
        mode,
        cooldownMs: settings.delay || 3000,
        lastResponseAt: 0,
        optOut: false,
        stats: { roastsSent: 0 }
      });
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} added in ${mode} mode.` });
      return true;
    }

    if (action === 'remove') {
      const numbers = (command.tail || '').split(/\s+/).filter(Boolean);
      const rawNumber = numbers[0];
      const normalizedNumber = normalizePhoneNumber(rawNumber);
      if (!normalizedNumber) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 remove <number>' });
        return true;
      }
      const filtered = targets.filter((target) => target.number !== normalizedNumber);
      saveTargets(filtered);
      await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} removed.` });
      return true;
    }

    if (action === 'stop' || action === 'start') {
      const numbers = (command.tail || '').split(/\s+/).filter(Boolean);
      const rawNumber = numbers[0];
      const normalizedNumber = normalizePhoneNumber(rawNumber);
      if (!normalizedNumber) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 stop <number>' });
        return true;
      }
      const target = targets.find((item) => item.number === normalizedNumber);
      if (!target) {
        await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} not found.` });
        return true;
      }
      target.enabled = action === 'start';
      target.optOut = false;
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} ${action === 'start' ? 'started' : 'stopped'}.` });
      return true;
    }

    if (action === 'change') {
      const parts = (command.tail || '').split(/\s+/).filter(Boolean);
      const rawNumber = parts[0];
      const mode = parseRoastMode(parts[1]);
      const normalizedNumber = normalizePhoneNumber(rawNumber);
      if (!normalizedNumber || !mode) {
        await socket.sendMessage(senderJid, { text: 'Usage: roast +234 change <number> easy|medium|hardcore' });
        return true;
      }
      const found = targets.find((item) => item.number === normalizedNumber);
      if (!found) {
        await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} not found.` });
        return true;
      }
      found.mode = mode;
      found.enabled = true;
      found.optOut = false;
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber} changed to ${mode}.` });
      return true;
    }

    if (action === 'status') {
      const parts = (command.tail || '').split(/\s+/).filter(Boolean);
      const rawNumber = parts[0];
      const normalizedNumber = normalizePhoneNumber(rawNumber);
      const target = targets.find((item) => item.number === normalizedNumber);
      if (!target) {
        await socket.sendMessage(senderJid, { text: `Target ${normalizedNumber || rawNumber} not found.` });
        return true;
      }
      await socket.sendMessage(senderJid, { text: `Target ${target.number}\n• Enabled: ${target.enabled ? 'YES' : 'NO'}\n• Mode: ${target.mode || 'medium'}\n• Cooldown: ${target.cooldownMs || settings.delay || 3000}ms\n• Opt-out: ${target.optOut ? 'YES' : 'NO'}` });
      return true;
    }
  }

  return false;
}

module.exports = {
  isLikelyCommandText,
  handleCommand,
  commandResponseMenu,
  normalizeCommandText,
  isOwner
};
