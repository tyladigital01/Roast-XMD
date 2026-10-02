const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode-terminal');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { config } = require('./config');
const { logger } = require('./logger');
const { ensureDataFiles, loadSettings, saveSettings, loadTargets, saveTargets, loadStats, saveStats, loadRoasts } = require('./database');
const { handleCommand, isLikelyCommandText, isOwner } = require('./handlers/messageHandler');
const { chooseRoastCategory, getRoastTextForMessage, normalizePhoneNumber, normalizeJid, buildTargetJid } = require('./roasts');

async function startBot() {
  ensureDataFiles();

  const { state, saveCreds } = await useMultiFileAuthState(path.join(config.SESSION_DIR));

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Roast XMD', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      QRCode.generate(qr, { small: true });
      logger.info('Scan the QR code to authenticate Roast XMD.');
    }

    if (connection === 'open') {
      logger.info('Connected');
      logger.info('Roast Engine: READY');
      logger.info('Roast +234: READY');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      logger.warn(`Connection closed: ${statusCode || 'unknown'}`);
      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('Session logged out. Delete the auth state to start a fresh login.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const incoming of messages) {
      if (!incoming.message || incoming.key?.fromMe) continue;
      if (incoming.message.protocolMessage) continue;
      if (incoming.message.type === 'chat' || incoming.message.conversation || incoming.message.extendedTextMessage) {
        try {
          await handleIncomingMessage(sock, incoming);
        } catch (error) {
          logger.error(`Failed to handle incoming message: ${error.message || error}`);
        }
      }
    }
  });

  return sock;
}

async function handleIncomingMessage(socket, message) {
  const settings = loadSettings();
  const stats = loadStats();
  const senderJid = message.key?.remoteJid || message.participant || message.key?.participant || '';
  const sender = normalizeJid(senderJid);

  if (!senderJid) return;

  const rawText = extractMessageText(message);
  if (!rawText) return;

  stats.messagesReceived = (stats.messagesReceived || 0) + 1;
  saveStats(stats);

  if (message.key?.fromMe) return;

  const trimmed = rawText.trim();
  if (!trimmed) return;

  if (isLikelyCommandText(trimmed)) {
    const handled = await handleCommand(socket, message, senderJid, trimmed);
    if (handled) return;
  }

  const targets = loadTargets();
  const directTarget = targets.find((target) => normalizeJid(target.number) === sender || normalizeJid(target.number) === senderJid || normalizeJid(target.number) === String(sender).replace(/^234/, '234'));

  if (directTarget && directTarget.enabled && !directTarget.optOut) {
    if (!directTarget.cooldownMs) directTarget.cooldownMs = settings.delay || 3000;
    const allowedAfter = Number(directTarget.lastResponseAt || 0) + Number(directTarget.cooldownMs || settings.delay || 3000);
    const now = Date.now();

    if (now >= allowedAfter) {
      const mode = directTarget.mode || settings.intensity || 'medium';
      const category = chooseRoastCategory(trimmed);
      const roast = getRoastTextForMessage(trimmed, mode, category, loadRoasts().custom || []);
      await socket.sendMessage(senderJid, { text: roast });
      directTarget.lastResponseAt = Date.now();
      directTarget.stats = directTarget.stats || { roastsSent: 0 };
      directTarget.stats.roastsSent += 1;
      stats.roastPlus234RoastsSent = (stats.roastPlus234RoastsSent || 0) + 1;
      saveStats(stats);
      saveTargets(targets);
      return;
    }
    return;
  }

  if (trimmed.toLowerCase().includes('stop') && (trimmed.toLowerCase().includes('roast') || trimmed.toLowerCase().includes('bot'))) {
    const out = targets.find((target) => normalizeJid(target.number) === sender || normalizeJid(target.number) === senderJid);
    if (out) {
      out.enabled = false;
      out.optOut = true;
      saveTargets(targets);
      await socket.sendMessage(senderJid, { text: 'Auto-roast has been disabled for this target. You can re-enable it later with roast +234 start <number>.' });
      return;
    }
  }

  if (!settings.enabled) return;
  if (message.key?.remoteJid?.endsWith('g.us')) {
    if (!settings.groupEnabled) return;
  } else if (!settings.privateEnabled) {
    return;
  }

  const category = chooseRoastCategory(trimmed);
  const roast = getRoastTextForMessage(trimmed, settings.intensity || 'medium', category, loadRoasts().custom || []);
  if (roast && roast.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, Number(settings.delay || 3000)));
    await socket.sendMessage(senderJid, { text: roast });
    stats.normalRoastsSent = (stats.normalRoastsSent || 0) + 1;
    saveStats(stats);
  }
}

function extractMessageText(message) {
  if (!message || !message.message) return '';
  const msg = message.message;
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage && msg.extendedTextMessage.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage && msg.imageMessage.caption) return msg.imageMessage.caption;
  if (msg.videoMessage && msg.videoMessage.caption) return msg.videoMessage.caption;
  if (msg.documentMessage && msg.documentMessage.caption) return msg.documentMessage.caption;
  if (msg.audioMessage && msg.audioMessage.caption) return msg.audioMessage.caption;
  if (msg.stickerMessage) return 'sticker';
  return '';
}

module.exports = { startBot, handleIncomingMessage };
