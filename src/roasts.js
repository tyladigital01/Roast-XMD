const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function normalizePhoneNumber(rawValue) {
  if (!rawValue) return null;
  const digits = String(rawValue).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function normalizeJid(rawValue) {
  if (!rawValue) return '';
  const sanitized = String(rawValue).replace(/@.*$/, '');
  return sanitized.replace(/\D/g, '');
}

function buildTargetJid(rawValue) {
  const normalized = normalizePhoneNumber(rawValue);
  if (!normalized) return null;
  return `${normalized.replace(/\D/g, '')}@s.whatsapp.net`;
}

const ROAST_CATEGORY_POOLS = {
  greetings: [
    'You said hello like it was a personality trait 😭',
    'Even your greeting sounds like a bug report. '
  ],
  goodMorning: [
    'Good morning, the sun is up and your confidence is still missing.',
    'Morning vibes, but your energy still needs a charger.'
  ],
  goodNight: [
    'Sleep tight, your drama is already tired too.',
    'Night mode activated; your excuses are still loud.'
  ],
  oneWord: [
    'One word and somehow it still sounds like a weak argument.',
    'Bro really sent a single word and expected a standing ovation.'
  ],
  dry: [
    'That reply was so dry it could start a desert documentary.',
    'You typed that with the energy of a funeral RSVP.'
  ],
  longMessage: [
    'That paragraph had more nonsense than a startup pitch.',
    'A full essay for a thought that only needed one sentence.'
  ],
  typingMistake: [
    'Even your typos look confused. They need therapy.',
    'You misspelled confidence and somehow still sounded wrong.'
  ],
  repeated: [
    'You repeated yourself like the app is lagging and you are the fix.',
    'This is not a speech; it is a loop with a worse soundtrack.'
  ],
  gaming: [
    'You play like your controller is on probation.',
    'That gameplay looked like a tutorial for losing.'
  ],
  excuses: [
    'You have the confidence of a person making excuses for losing.',
    'That excuse was so weak even the Wi-Fi disconnected from it.'
  ],
  arguments: [
    'You argue like a toaster with a chip on its shoulder.',
    'That point had less substance than a free giveaway.'
  ],
  why: [
    'Why? Because your question arrived with the same energy as a glitch.',
    'The better question is: why do you still sound this confused?' 
  ],
  whoAreYou: [
    'You sound like a sketchy startup with no users and a lot of confidence.',
    'Who are you? A walking typo with a comeback problem.'
  ],
  laughing: [
    'You laughed harder than a failed startup presentation.',
    'That laugh had all the confidence of a broken joke.'
  ],
  relationship: [
    'Your love life needs an update more than your phone.',
    'That relationship advice sounded like someone reading a demo script.'
  ],
  general: [
    'You speak like a bug report with a personality disorder.',
    'You are not a roast, you are a warning label with Wi-Fi.',
    'Your vibe is so off, even the autocorrect is judging you.',
    'This is not a comeback, this is just your default setting.',
    'You hit the conversation like a toaster in a thunderstorm.',
    'Bro, your energy is giving free trial and no refund.'
  ],
  comebacks: [
    'That comeback had less power than a dead phone charger.',
    'You tried to flex, but the joke still had your name on it.'
  ]
};

function chooseRoastCategory(messageText) {
  const text = String(messageText || '').toLowerCase();
  if (!text) return 'general';

  if (/good morning|gm|morning/.test(text)) return 'goodMorning';
  if (/good night|gn|night/.test(text)) return 'goodNight';
  if (/why\?|why /i.test(text)) return 'why';
  if (/who are you|who r u|who are u|who is this/.test(text)) return 'whoAreYou';
  if (/lol|haha|😂|😹|😂😂|lmao|lmfao|haha/.test(text)) return 'laughing';
  if (/game|fps|valorant|pubg|cod|minecraft|ranked|aim/.test(text)) return 'gaming';
  if (/sorry|late|busy|network|wifi|signal|traffic|battery|forgot|excuse/.test(text)) return 'excuses';
  if (/argument|fight|disagree|not true|wrong|you are wrong|stupid/.test(text)) return 'arguments';
  if (/(?:^|\s)hi(?:\s|$)|hello|hey|yo|sup/.test(text)) return 'greetings';
  if (/love|relationship|dating|gf|bf|crush|marry|baby/.test(text)) return 'relationship';
  if (/\b[a-z]{1,2}\b/.test(text) && text.trim().split(/\s+/).length <= 2) return 'oneWord';
  if (/[\w]{20,}/.test(text)) return 'longMessage';
  if (/teh|mssing|thier|wierd|wht|wtf|hie|helo/.test(text)) return 'typingMistake';
  if (/(.)\1{2,}/.test(text)) return 'repeated';
  if (/comeback|reply|nah|nope|bro/.test(text)) return 'comebacks';
  return 'general';
}

function getPoolForIntensity(category, intensity) {
  const pool = ROAST_CATEGORY_POOLS[category] || ROAST_CATEGORY_POOLS.general;
  return pool;
}

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return 'You tried, but this roast pool is empty.';
  return list[Math.floor(Math.random() * list.length)];
}

function getRoastTextForMessage(messageText, intensity, category, customRoasts = []) {
  const pool = [...customRoasts.filter((item) => {
    if (!item || !item.text) return false;
    if (item.intensity && item.intensity !== intensity) return false;
    if (item.category && item.category !== category) return false;
    return true;
  }).map((item) => item.text), ...getPoolForIntensity(category, intensity)];

  const fallback = pickRandom(getPoolForIntensity(category, intensity));
  return pickRandom(pool.length ? pool : fallback);
}

module.exports = {
  normalizePhoneNumber,
  normalizeJid,
  buildTargetJid,
  chooseRoastCategory,
  getRoastTextForMessage,
  ROAST_CATEGORY_POOLS,
  getPoolForIntensity
};
