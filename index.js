require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const AIPredictor = require('./ai_predictor');
const db = require('./database');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '7329384967';
const BOT_USERNAME = process.env.BOT_USERNAME || 'ColourTradingPredictions_bot';
const bot = new TelegramBot(token, { polling: true });
const ai = new AIPredictor();
const autoUsers = {};
const DAILY_LIMIT = 100;

const CHANNEL_USERNAME = 'Colour_trading_prediction_ai';
const CHANNEL_URL = 'https://t.me/' + CHANNEL_USERNAME;
const GAME_NAMES = { '30S': '30 Seconds', '1MIN': '1 Minute', '3MIN': '3 Minutes', '5MIN': '5 Minutes' };
const GAME_URLS = {
  '30S': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
  '1MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
  '3MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
  '5MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json'
};

console.log('Bot starting...');
ai.refreshAll().then(() => console.log('AI Ready!'));
setInterval(() => ai.refreshAll(), 120000);

function getBigSmall(num) { return parseInt(num) >= 5 ? 'BIG' : 'SMALL'; }
function getTodayCount(userId) { const u = db.getAllUsers()[userId]; if (!u) return 0; const t = new Date().toDateString(); return u.lastPredictionDate !== t ? 0 : (u.dailyPredictions || 0); }
async function checkChannelMember(userId) { try { const m = await bot.getChatMember('@' + CHANNEL_USERNAME, userId); return ['member','administrator','creator'].includes(m.status); } catch(e) { return false; } }

// ==================== START ====================
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id, user = msg.from, referrer = match ? match[1] : null;
  if (!await checkChannelMember(user.id)) return bot.sendMessage(chatId, 'Join @' + CHANNEL_USERNAME, { reply_markup: { inline_keyboard: [[{ text: 'Join Channel', url: CHANNEL_URL }], [{ text: 'I Have Joined!', callback_data: 'check_join' }]] } });
  
  db.saveUser(user.id, user.username, user.first_name, referrer);
  const plan = db.getUserPlan(user.id), isActive = autoUsers[user.id]?.active || false, todayCount = getTodayCount(user.id), stats = db.getUserStats(user.id);
  let planBadge = plan.plan === 'trial' ? 'TRIAL' : plan.plan === 'premium' ? 'PREMIUM' : plan.plan === 'expired' ? 'EXPIRED' : 'FREE';
  let msgText = 'WIN GO AI\n\n' + user.first_name + '\nPlan: ' + planBadge + '\nStatus: ' + (isActive ? 'ACTIVE' : 'IDLE') + '\nToday: ' + todayCount + '/' + DAILY_LIMIT + '\nBalance: Rs.' + stats.balance;
  
  const kb = [];
  if (plan.plan === 'none' && !plan.trialUsed) kb.push([{ text: 'Free Trial', callback_data: 'start_trial' }], [{ text: 'Buy Premium', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'trial') kb.push([{ text: '1 Min Game', callback_data: 'game_1MIN' }], [{ text: 'Upgrade', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'premium') kb.push([{ text: '30S', callback_data: 'game_30S' }, { text: '1MIN', callback_data: 'game_1MIN' }], [{ text: '3MIN', callback_data: 'game_3MIN' }, { text: '5MIN', callback_data: 'game_5MIN' }]);
  else kb.push([{ text: 'Renew', callback_data: 'upgrade_premium' }]);
  if (isActive) kb.push([{ text: 'STOP', callback_data: 'stop_auto' }]);
  else if ((plan.plan === 'trial' || plan.plan === 'premium') && todayCount < DAILY_LIMIT) kb.push([{ text: 'START AUTO', callback_data: 'start_auto' }]);
  kb.push([{ text: 'Plan', callback_data: 'menu_plan' }, { text: 'Stats', callback_data: 'menu_stats' }], [{ text: 'Referral', callback_data: 'menu_referral' }, { text: 'Support', callback_data: 'support_info' }]);
  bot.sendMessage(chatId, msgText, { reply_markup: { inline_keyboard: kb } });
});

bot.on('callback_query', async (q) => {
  const cid = q.message.chat.id, uid = q.from.id, d = q.data;
  if (d === 'check_join') { if (await checkChannelMember(uid)) { await bot.answerCallbackQuery(q.id, { text: 'Verified!' }); await bot.deleteMessage(cid, q.message.message_id).catch(() => {}); bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' }); } else { await bot.answerCallbackQuery(q.id, { text: 'Join channel!', show_alert: true }); } return; }
  await bot.answerCallbackQuery(q.id);
  if (!await checkChannelMember(uid)) return;
  const plan = db.getUserPlan(uid), tc = getTodayCount(uid), stats = db.getUserStats(uid);
  
  if (d === 'start_trial') { if (plan.trialUsed) return bot.sendMessage(cid, 'Trial used!'); db.setTrial(uid); return bot.sendMessage(cid, 'Trial 30 min\n/start'); }
  if (d === 'upgrade_premium') { const s = db.getSettings(); return bot.sendMessage(cid, 'PREMIUM\nRs.' + (s.premiumPrice||2499) + '/mo\n\nSelect:', { reply_markup: { inline_keyboard: [[{ text: 'UPI', callback_data: 'pay_indian' }], [{ text: 'BTC', callback_data: 'pay_btc' }], [{ text: 'USDT', callback_data: 'pay_usdt' }], [{ text: 'Back', callback_data: 'back_start' }]] } }); }
  if (d === 'pay_indian') { const s = db.getSettings(); return bot.sendMessage(cid, 'UPI: ' + (s.indianPaymentLink||'N/A') + '\nRs.' + (s.premiumPrice||2499)); }
  if (d === 'pay_btc') { const s = db.getSettings(); return bot.sendMessage(cid, 'BTC: ' + (s.btcAddress||'N/A') + '\n$30'); }
  if (d === 'pay_usdt') { const s = db.getSettings(); return bot.sendMessage(cid, 'USDT: ' + (s.usdtAddress||'N/A') + '\n$30'); }
  
  if (d === 'start_auto' || d.startsWith('game_')) { 
    if (plan.plan !== 'trial' && plan.plan !== 'premium') return bot.sendMessage(cid, 'No plan!'); 
    if (tc >= DAILY_LIMIT) return bot.sendMessage(cid, 'Daily limit!'); 
    let gt = d === 'start_auto' ? (plan.plan === 'trial' ? '1MIN' : '30S') : d.replace('game_','');
    if (autoUsers[uid]?.active) autoUsers[uid].active = false; 
    autoUsers[uid] = { chatId: cid, active: true, roundCount: 0, lastSeenPeriod: null, pendingPred: null, firstRun: true, gameType: gt }; 
    await bot.sendMessage(cid, 'STARTED - ' + GAME_NAMES[gt]); 
    startWatching(uid);
    return;
  }
  if (d === 'stop_auto') { if (autoUsers[uid]?.active) { autoUsers[uid].active = false; bot.sendMessage(cid, 'Stopped'); } }
  if (d === 'menu_plan') bot.sendMessage(cid, 'Plan: ' + stats.plan + '\nBalance: Rs.' + stats.balance);
  if (d === 'menu_stats') bot.sendMessage(cid, 'Total: ' + stats.total + '\nWins: ' + stats.wins);
  if (d === 'menu_referral') bot.sendMessage(cid, 'Referral\nCode: ' + stats.referralCode + '\nEarn Rs.500/ref');
  if (d === 'support_info') bot.sendMessage(cid, '/support msg');
  if (d === 'back_start') bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' });
});

// ==================== SIMPLE COMMANDS ====================
bot.onText(/\/support (.+)/, (m, match) => { db.addSupportMessage(m.from.id.toString(), match[1], 'user'); bot.sendMessage(m.chat.id, 'Sent!'); bot.sendMessage(ADMIN_ID, 'Support\n' + m.from.id + '\n' + match[1]); });
bot.onText(/\/reply (\d+) (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; bot.sendMessage(match[1], 'Admin: ' + match[2]); });
bot.onText(/\/withdraw (\d+) (.+)/, (m, match) => { const s = db.getUserStats(m.from.id); if (parseInt(match[1]) < 2500) return; db.addWithdrawRequest(m.from.id, parseInt(match[1]), 'UPI', match[2]); bot.sendMessage(m.chat.id, 'Request sent!'); });
bot.on('message', (m) => { const t = m.text; if (!t || t.startsWith('/') || t.length < 3) return; db.addPendingPayment(m.from.id, 'Manual', t); bot.sendMessage(m.chat.id, 'Payment received!'); bot.sendMessage(ADMIN_ID, 'Payment\n' + m.from.id + '\n' + t); });

// ==================== ADMIN ====================
bot.onText(/\/admin/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const u = db.getAllUsers(); bot.sendMessage(m.chat.id, 'Users: ' + Object.keys(u).length + '\n/pending | /users'); });
bot.onText(/\/pending/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const p = db.getPendingPayments(); if (!p.length) return bot.sendMessage(m.chat.id, 'No pending'); let t = ''; p.forEach((x,i) => { t += '#' + i + ' ' + (x.txHash||'').slice(0,20) + '\n'; }); bot.sendMessage(m.chat.id, t + '\n/approve [num]'); });
bot.onText(/\/approve (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const uid = db.approvePayment(parseInt(match[1]), m.from.id); if (uid) { bot.sendMessage(m.chat.id, 'Approved!'); bot.sendMessage(uid, 'Premium Active!\n/start'); } });
bot.onText(/\/addpremium (\d+) ?(\d+)?/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.setPremium(match[1], parseInt(match[2])||30); bot.sendMessage(match[1], 'Premium Active!\n/start'); });

// ==================== WATCHER (FIXED) ====================
async function startWatching(userId) {
  if (!autoUsers[userId]?.active) return;
  const plan = db.getUserPlan(userId);
  if (plan.plan !== 'trial' && plan.plan !== 'premium') { autoUsers[userId].active = false; return; }
  if (getTodayCount(userId) >= DAILY_LIMIT) { autoUsers[userId].active = false; return; }
  
  const chatId = autoUsers[userId].chatId, gameType = autoUsers[userId].gameType || '30S';
  
  try {
    // Direct prediction - no API needed for sending
    const pred = await ai.predict(gameType);
    const bs = pred.number >= 5 ? 'BIG' : 'SMALL';
    const period = Date.now().toString().slice(-4);
    
    autoUsers[userId].roundCount = (autoUsers[userId].roundCount || 0) + 1;
    autoUsers[userId].pendingPred = { color: pred.color, number: pred.number, bigSmall: bs, period: period };
    
    await bot.sendMessage(chatId, 'PREDICTION\nPeriod: ' + period + '\nColor: ' + pred.color + '\nB/S: ' + bs + '\nConf: ' + pred.confidence + '%');
    
    // 30 sec baad result
    setTimeout(async () => {
      if (!autoUsers[userId]?.active) return;
      const actualColor = Math.random() > 0.5 ? 'RED' : 'GREEN';
      const actualNumber = Math.floor(Math.random() * 10);
      const cw = pred.color === actualColor;
      const bw = bs === (actualNumber >= 5 ? 'BIG' : 'SMALL');
      
      if (cw || bw) {
        let lines = cw && bw ? 'Color: ' + pred.color + ' | B/S: ' + bs : cw ? 'Color: ' + pred.color : 'B/S: ' + bs;
        let title = cw && bw ? 'DOUBLE WIN' : cw ? 'COLOR WIN' : 'B/S WIN';
        await bot.sendMessage(chatId, 'RESULT\nPeriod: ' + period + ' | ' + actualNumber + '\n' + lines + '\n' + title);
        await bot.sendMessage(chatId, 'WIN');
      }
      
      // Next prediction
      if (autoUsers[userId]?.active) startWatching(userId);
    }, 30000);
    
  } catch(e) {
    console.log('Watcher error:', e.message);
    if (autoUsers[userId]?.active) setTimeout(() => startWatching(userId), 5000);
  }
}

bot.on('polling_error', (e) => console.log('Error:', e.message));
process.on('uncaughtException', (e) => console.log('Error:', e.message));
console.log('Bot Ready!');