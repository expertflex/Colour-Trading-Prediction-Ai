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
  if (!await checkChannelMember(user.id)) return bot.sendMessage(chatId, 
    '━━━━━━━━━━━━━━━━━━\n' +
    '🔒 ACCESS RESTRICTED\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    'Please join our official channel to access this bot.\n\n' +
    '📢 @' + CHANNEL_USERNAME + '\n\n' +
    '1. Join the channel\n' +
    '2. Click "I Have Joined" button',
    { reply_markup: { inline_keyboard: [
      [{ text: '📢 Join Official Channel', url: CHANNEL_URL }],
      [{ text: '✅ I Have Joined! Proceed', callback_data: 'check_join' }]
    ]}}
  );
  
  db.saveUser(user.id, user.username, user.first_name, referrer);
  const plan = db.getUserPlan(user.id), isActive = autoUsers[user.id]?.active || false, todayCount = getTodayCount(user.id), stats = db.getUserStats(user.id);
  let planBadge = plan.plan === 'trial' ? '🟠 TRIAL' : plan.plan === 'premium' ? '💎 PREMIUM' : plan.plan === 'expired' ? '🔴 EXPIRED' : '⚪ FREE';
  
  let msgText = '━━━━━━━━━━━━━━━━━━\n' +
    '🤖 WIN GO AI PREDICTOR\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    '👤 Account: ' + user.first_name + '\n' +
    '📅 Plan: ' + planBadge + '\n' +
    '📊 Status: ' + (isActive ? '🟢 ACTIVE' : '⚫ IDLE') + '\n' +
    '🔮 Predictions: ' + todayCount + '/' + DAILY_LIMIT + '\n' +
    '💰 Balance: Rs.' + stats.balance + '\n\n' +
    '━━━━━━━━━━━━━━━━━━';
  
  const kb = [];
  if (plan.plan === 'none' && !plan.trialUsed) kb.push([{ text: '🎁 Start Free Trial', callback_data: 'start_trial' }], [{ text: '💎 Buy Premium Access', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'trial') kb.push([{ text: '🎮 Play 1 Minute', callback_data: 'game_1MIN' }], [{ text: '💎 Upgrade to Premium', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'premium') kb.push([{ text: '⚡ 30 Sec', callback_data: 'game_30S' }, { text: '🕐 1 Min', callback_data: 'game_1MIN' }], [{ text: '🕒 3 Min', callback_data: 'game_3MIN' }, { text: '🕔 5 Min', callback_data: 'game_5MIN' }]);
  else kb.push([{ text: '💎 Renew Premium', callback_data: 'upgrade_premium' }]);
  
  if (isActive) kb.push([{ text: '🔴 STOP AUTO', callback_data: 'stop_auto' }]);
  else if ((plan.plan === 'trial' || plan.plan === 'premium') && todayCount < DAILY_LIMIT) kb.push([{ text: '🟢 START AUTO', callback_data: 'start_auto' }]);
  
  kb.push([{ text: '📅 My Plan', callback_data: 'menu_plan' }, { text: '📊 Statistics', callback_data: 'menu_stats' }]);
  kb.push([{ text: '🔗 Referral Program', callback_data: 'menu_referral' }, { text: '💬 Support', callback_data: 'support_info' }]);
  
  bot.sendMessage(chatId, msgText, { reply_markup: { inline_keyboard: kb } });
});

// ==================== CALLBACKS ====================
bot.on('callback_query', async (q) => {
  const cid = q.message.chat.id, uid = q.from.id, d = q.data;
  if (d === 'check_join') { if (await checkChannelMember(uid)) { await bot.answerCallbackQuery(q.id, { text: 'Verified! Welcome aboard!' }); await bot.deleteMessage(cid, q.message.message_id).catch(() => {}); bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' }); } else { await bot.answerCallbackQuery(q.id, { text: 'Please join the channel first!', show_alert: true }); } return; }
  await bot.answerCallbackQuery(q.id);
  if (!await checkChannelMember(uid)) return bot.sendMessage(cid, 'Please join @' + CHANNEL_USERNAME + ' to continue.');
  
  const plan = db.getUserPlan(uid), tc = getTodayCount(uid), stats = db.getUserStats(uid);
  
  if (d === 'start_trial') { if (plan.trialUsed) return bot.sendMessage(cid, 'You have already used your free trial.\n\nUpgrade to Premium for unlimited access.'); db.setTrial(uid); return bot.sendMessage(cid, '🎁 TRIAL ACTIVATED!\n\nDuration: 30 Minutes\nGame Mode: 1 Minute\n\nUse /start to begin playing.'); }
  
  if (d === 'upgrade_premium') { const s = db.getSettings(); return bot.sendMessage(cid, 
    '━━━━━━━━━━━━━━━━━━\n💎 PREMIUM MEMBERSHIP\n━━━━━━━━━━━━━━━━━━\n\n' +
    '🇮🇳 India: Rs.' + (s.premiumPrice||2499) + '/month\n' +
    '🌍 Global: $30/month\n\n' +
    'Benefits:\n' +
    '• All 4 Game Modes\n' +
    '• 100 Daily Predictions\n' +
    '• Rs.500 per Referral\n' +
    '• Priority Support\n\n' +
    'Select Payment Method:',
    { reply_markup: { inline_keyboard: [
      [{ text: '🇮🇳 UPI / Card', callback_data: 'pay_indian' }],
      [{ text: '🔵 Bitcoin (BTC)', callback_data: 'pay_btc' }],
      [{ text: '🟢 USDT (TRC20)', callback_data: 'pay_usdt' }],
      [{ text: '« Back to Menu', callback_data: 'back_start' }]
    ]}}
  );}
  
  if (d === 'pay_indian') { const s = db.getSettings(); return bot.sendMessage(cid, '🇮🇳 INDIAN PAYMENT\n\nLink: ' + (s.indianPaymentLink||'Set by admin') + '\nAmount: Rs.' + (s.premiumPrice||2499) + '\n\nAfter payment, send your UTR/Transaction ID here.'); }
  if (d === 'pay_btc') { const s = db.getSettings(); return bot.sendMessage(cid, '🔵 BITCOIN PAYMENT\n\nAddress: ' + (s.btcAddress||'Set by admin') + '\nAmount: $30 in BTC\n\nSend TX Hash after payment.'); }
  if (d === 'pay_usdt') { const s = db.getSettings(); return bot.sendMessage(cid, '🟢 USDT PAYMENT (TRC20)\n\nAddress: ' + (s.usdtAddress||'Set by admin') + '\nAmount: $30 in USDT\n\nSend TX Hash after payment.'); }
  
  if (d === 'start_auto') { if (plan.plan !== 'trial' && plan.plan !== 'premium') return bot.sendMessage(cid, 'No active plan! Start trial or upgrade.'); if (tc >= DAILY_LIMIT) return bot.sendMessage(cid, 'Daily limit reached! Resets at midnight.'); let gt = plan.plan === 'trial' ? '1MIN' : '30S'; if (autoUsers[uid]?.active) autoUsers[uid].active = false; autoUsers[uid] = { chatId: cid, active: true, roundCount: 0, lastSeenPeriod: null, pendingPred: null, firstRun: true, gameType: gt }; await bot.sendMessage(cid, '🟢 AUTO PREDICTIONS STARTED\n\nMode: ' + GAME_NAMES[gt] + '\nRemaining: ' + (DAILY_LIMIT-tc) + '/' + DAILY_LIMIT); startWatching(uid); }
  if (d.startsWith('game_')) { let gt = d.replace('game_',''), allowed = plan.plan === 'trial' ? ['1MIN'] : ['30S','1MIN','3MIN','5MIN']; if (!allowed.includes(gt)) return bot.sendMessage(cid, 'This game requires Premium access.'); if (tc >= DAILY_LIMIT) return bot.sendMessage(cid, 'Daily limit reached!'); if (autoUsers[uid]?.active) autoUsers[uid].active = false; autoUsers[uid] = { chatId: cid, active: true, roundCount: 0, lastSeenPeriod: null, pendingPred: null, firstRun: true, gameType: gt }; await bot.sendMessage(cid, 'Game mode set to ' + GAME_NAMES[gt]); startWatching(uid); }
  if (d === 'stop_auto') { if (autoUsers[uid]?.active) { autoUsers[uid].active = false; bot.sendMessage(cid, 'Auto predictions stopped.\nTotal rounds: ' + (autoUsers[uid].roundCount||0)); } }
  if (d === 'menu_plan') bot.sendMessage(cid, 'YOUR PLAN\n\nCurrent: ' + stats.plan.toUpperCase() + '\nBalance: Rs.' + stats.balance + '\nReferral Earnings: Rs.' + stats.referralEarnings);
  if (d === 'menu_stats') bot.sendMessage(cid, 'YOUR STATISTICS\n\nTotal Predictions: ' + stats.total + '\nWins: ' + stats.wins + '\nLosses: ' + stats.losses + '\nWin Rate: ' + stats.winRate + '%');
  if (d === 'menu_referral') { bot.sendMessage(cid, 'REFERRAL PROGRAM\n\nYour Code: ' + stats.referralCode + '\nYour Link: https://t.me/' + BOT_USERNAME + '?start=' + stats.referralCode + '\n\nEarn Rs.500 for each Premium referral!\nCurrent Balance: Rs.' + stats.balance, { disable_web_page_preview: true }); }
  if (d === 'support_info') bot.sendMessage(cid, 'CUSTOMER SUPPORT\n\nSend your query:\n/support your message here\n\nWe reply within 5-10 minutes.');
  if (d === 'back_start') bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' });
});

// ==================== SUPPORT ====================
bot.onText(/\/support (.+)/, (m, match) => { db.addSupportMessage(m.from.id.toString(), match[1], 'user'); bot.sendMessage(m.chat.id, 'Your support ticket has been created. We will reply shortly.'); bot.sendMessage(ADMIN_ID, 'SUPPORT\nUser: ' + m.from.id + '\nMessage: ' + match[1] + '\n\nReply: /reply ' + m.from.id + ' [message]'); });
bot.onText(/\/reply (\d+) (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.addSupportMessage(match[1], match[2], 'admin'); bot.sendMessage(match[1], 'Support Reply:\n\n' + match[2] + '\n\nReply with /support [message]'); bot.sendMessage(m.chat.id, 'Reply sent to user.'); });

// ==================== WITHDRAW ====================
bot.onText(/\/withdraw (\d+) (.+)/, (m, match) => { const uid = m.from.id, amt = parseInt(match[1]), addr = match[2], s = db.getUserStats(uid); if (amt < 2500) return bot.sendMessage(m.chat.id, 'Minimum withdraw amount is Rs.2,500. Your balance: Rs.' + s.balance); if (amt > s.balance) return bot.sendMessage(m.chat.id, 'Insufficient balance! Available: Rs.' + s.balance); db.addWithdrawRequest(uid, amt, addr.includes('@')?'UPI':'Crypto', addr); bot.sendMessage(m.chat.id, 'Withdraw request submitted!\n\nAmount: Rs.' + amt + '\nMethod: ' + (addr.includes('@')?'UPI':'Crypto') + '\n\nAdmin will process within 24 hours.'); bot.sendMessage(ADMIN_ID, 'WITHDRAW REQUEST\nUser: ' + uid + '\nAmount: Rs.' + amt + '\nAddress: ' + addr + '\n\n/approvewd [index]'); });

// ==================== PAYMENT ====================
bot.on('message', (m) => { const t = m.text; if (!t || t.startsWith('/') || t.length < 3) return; const ignore = ['Free Trial','Buy Premium','1 Minute','Upgrade','30 Sec','1 Min','3 Min','5 Min','Renew','STOP','START AUTO','Plan','Statistics','Referral','Support','Back']; if (ignore.some(x => t.includes(x))) return; db.addPendingPayment(m.from.id, 'Manual', t); bot.sendMessage(m.chat.id, 'Payment proof received! Admin will verify and activate your premium access shortly.'); bot.sendMessage(ADMIN_ID, 'NEW PAYMENT\nUser: ' + m.from.id + '\nProof: ' + t + '\n\n/approve 0'); });

// ==================== ADMIN PANEL ====================
bot.onText(/\/admin/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const u = db.getAllUsers(), p = db.getPendingPayments(), w = db.getWithdrawRequests().filter(r => r.status === 'pending'), pu = db.getPremiumUsers(); bot.sendMessage(m.chat.id, 'ADMIN DASHBOARD\n\nUsers: ' + Object.keys(u).length + '\nPremium: ' + pu.length + '\nTrial: ' + Object.values(u).filter(x => x.plan === 'trial').length + '\nPending Payments: ' + p.length + '\nPending Withdraws: ' + w.length + '\n\nCommands:\n/pending - Payment approvals\n/withdrawals - Withdraw requests\n/users - User list\n/settings - Configuration\n/broadcast - Message all'); });

bot.onText(/\/pending/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const p = db.getPendingPayments(); if (!p.length) return bot.sendMessage(m.chat.id, 'No pending payments.'); let t = 'PENDING PAYMENTS\n\n'; p.forEach((x,i) => { t += '#' + i + ' | User: ' + (x.userId||'').slice(-6) + ' | ' + (x.type||'Manual') + '\nProof: ' + (x.txHash||'').slice(0,30) + '\n\n'; }); t += 'Approve: /approve [number]\nReject: /reject [number]'; bot.sendMessage(m.chat.id, t); });

bot.onText(/\/approve (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const uid = db.approvePayment(parseInt(match[1]), m.from.id); if (uid) { bot.sendMessage(m.chat.id, 'Payment approved! User ' + uid + ' is now PREMIUM.'); bot.sendMessage(uid, 'PAYMENT APPROVED!\n\nYour Premium access is now active.\n\nUse /start to begin!'); } else bot.sendMessage(m.chat.id, 'Invalid payment index.'); });

bot.onText(/\/reject (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.rejectPayment(parseInt(match[1])); bot.sendMessage(m.chat.id, 'Payment rejected.'); });

bot.onText(/\/withdrawals/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const w = db.getWithdrawRequests().filter(r => r.status === 'pending'); if (!w.length) return bot.sendMessage(m.chat.id, 'No pending withdrawals.'); let t = 'PENDING WITHDRAWALS\n\n'; w.forEach((x,i) => { t += '#' + i + ' | User: ' + (x.userId||'').slice(-6) + ' | Rs.' + x.amount + ' | ' + (x.method||'') + '\nAddress: ' + (x.address||'') + '\n\n'; }); t += 'Approve: /approvewd [number]'; bot.sendMessage(m.chat.id, t); });

bot.onText(/\/approvewd (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const uid = db.approveWithdraw(parseInt(match[1])); if (uid) { bot.sendMessage(m.chat.id, 'Withdraw approved for user ' + uid); bot.sendMessage(uid, 'WITHDRAW APPROVED!\n\nYour payment has been processed.'); } });

bot.onText(/\/users/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const u = db.getAllUsers(); let t = 'USER LIST\n\n'; Object.entries(u).slice(0,25).forEach(([id, data]) => { t += (data.firstName||'N/A') + ' | ' + (data.plan||'none') + ' | ID: ' + id.slice(-6) + '\n'; }); bot.sendMessage(m.chat.id, t); });

bot.onText(/\/premiumusers/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const pu = db.getPremiumUsers(); if (!pu.length) return bot.sendMessage(m.chat.id, 'No premium users.'); let t = 'PREMIUM USERS\n\n'; pu.forEach(u => { t += (u.firstName||'N/A') + ' | ID: ' + (u.id||'').slice(-6) + '\n'; }); bot.sendMessage(m.chat.id, t); });

bot.onText(/\/userinfo (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const s = db.getUserStats(match[1]); const u = db.getAllUsers()[match[1]]; if (!u) return bot.sendMessage(m.chat.id, 'User not found.'); bot.sendMessage(m.chat.id, 'USER DETAILS\n\nName: ' + (u.firstName||'N/A') + '\nID: ' + match[1] + '\nPlan: ' + (u.plan||'none') + '\nBalance: Rs.' + (u.balance||0) + '\nReferral Earnings: Rs.' + (u.referralEarnings||0) + '\nPredictions: ' + s.total + '\nWins: ' + s.wins + '\nWin Rate: ' + s.winRate + '%'); });

bot.onText(/\/restarttrial (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.restartTrial(match[1]); bot.sendMessage(m.chat.id, 'Trial restarted for user ' + match[1]); bot.sendMessage(match[1], 'Your free trial has been restarted!\n\nUse /start to begin.'); });

bot.onText(/\/addpremium (\d+) ?(\d+)?/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const days = parseInt(match[2]) || 30; db.setPremium(match[1], days); bot.sendMessage(m.chat.id, 'Premium added! ' + days + ' days for user ' + match[1]); bot.sendMessage(match[1], 'PREMIUM ACTIVATED!\n\nDuration: ' + days + ' days\n\nUse /start to begin!'); });

bot.onText(/\/removepremium (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.removePremium(match[1]); bot.sendMessage(m.chat.id, 'Premium removed from user ' + match[1]); });

bot.onText(/\/deleteuser (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.deleteUser(match[1]); bot.sendMessage(m.chat.id, 'User deleted.'); });

bot.onText(/\/supportlist/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const users = db.getAllSupportUsers(); if (!users.length) return bot.sendMessage(m.chat.id, 'No support chats.'); let t = 'SUPPORT CHATS\n\n'; users.forEach(uid => { t += 'User: ' + uid.slice(-6) + ' | Messages: ' + db.getSupportChats(uid).length + '\n'; }); t += '\n/viewchat [userID] to view chat'; bot.sendMessage(m.chat.id, t); });

bot.onText(/\/viewchat (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const chats = db.getSupportChats(match[1]); if (!chats.length) return bot.sendMessage(m.chat.id, 'No messages.'); let t = 'CHAT HISTORY\n\n'; chats.forEach(c => { t += (c.from==='admin'?'Admin':'User') + ': ' + c.text + '\n'; }); bot.sendMessage(m.chat.id, t); });

// ==================== SETTINGS ====================
bot.onText(/\/settings/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const s = db.getSettings(); bot.sendMessage(m.chat.id, 'CONFIGURATION\n\nPayment Link: ' + (s.indianPaymentLink||'Not set') + '\nBTC Address: ' + (s.btcAddress||'Not set') + '\nUSDT Address: ' + (s.usdtAddress||'Not set') + '\nPremium Price: Rs.' + (s.premiumPrice||2499) + '\nReferral Commission: Rs.' + (s.referralCommission||500) + '\nMin Withdraw: Rs.' + (s.minWithdraw||2500) + '\n\nCommands:\n/setlink [url]\n/setbtc [address]\n/setusdt [address]\n/setprice [amount]\n/setref [amount]\n/setminwd [amount]'); });

bot.onText(/\/setlink (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ indianPaymentLink: match[1] }); bot.sendMessage(m.chat.id, 'Payment link updated.'); });
bot.onText(/\/setbtc (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ btcAddress: match[1] }); bot.sendMessage(m.chat.id, 'BTC address updated.'); });
bot.onText(/\/setusdt (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ usdtAddress: match[1] }); bot.sendMessage(m.chat.id, 'USDT address updated.'); });
bot.onText(/\/setprice (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ premiumPrice: parseInt(match[1]) }); bot.sendMessage(m.chat.id, 'Price updated to Rs.' + match[1]); });
bot.onText(/\/setref (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ referralCommission: parseInt(match[1]) }); bot.sendMessage(m.chat.id, 'Referral commission updated to Rs.' + match[1]); });
bot.onText(/\/setminwd (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ minWithdraw: parseInt(match[1]) }); bot.sendMessage(m.chat.id, 'Min withdraw updated to Rs.' + match[1]); });

// ==================== BROADCAST ====================
bot.onText(/\/broadcast (.+)/, async (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const ids = Object.keys(db.getAllUsers()); let s = 0; for (const id of ids) { try { await bot.sendMessage(id, '📢 ANNOUNCEMENT\n\n' + match[1]); s++; } catch(e) {} } bot.sendMessage(m.chat.id, 'Broadcast sent to ' + s + '/' + ids.length + ' users.'); });

// ==================== WATCHER ====================
async function startWatching(userId) {
  if (!autoUsers[userId]?.active) return;
  const plan = db.getUserPlan(userId);
  if (plan.plan !== 'trial' && plan.plan !== 'premium') { autoUsers[userId].active = false; return; }
  if (getTodayCount(userId) >= DAILY_LIMIT) { autoUsers[userId].active = false; return bot.sendMessage(autoUsers[userId].chatId, 'Daily prediction limit reached. Resets at midnight.'); }
  const chatId = autoUsers[userId].chatId, gameType = autoUsers[userId].gameType || '30S';
  try {
    const r = await axios.get(GAME_URLS[gameType], { params: { ts: Date.now() }, timeout: 5000 });
    const list = (r.data?.data?.list || []);
    if (!list.length) { setTimeout(() => startWatching(userId), 2000); return; }
    const latest = list[0], lp = latest.issueNumber;
    if (autoUsers[userId].firstRun) { autoUsers[userId].firstRun = false; autoUsers[userId].lastSeenPeriod = lp; await sendPrediction(userId, lp); setTimeout(() => startWatching(userId), 2000); return; }
    if (autoUsers[userId].lastSeenPeriod === lp) { setTimeout(() => startWatching(userId), 1000); return; }
    autoUsers[userId].lastSeenPeriod = lp;
    const ac = (latest.color||'').toUpperCase().includes('RED') ? 'RED' : 'GREEN', an = parseInt(latest.number);
    if (autoUsers[userId].pendingPred && lp === autoUsers[userId].pendingPred.period) {
      const pred = autoUsers[userId].pendingPred, cw = pred.color === ac, bw = pred.bigSmall === getBigSmall(an);
      db.updatePredictionResult(lp, ac, an);
      if (cw || bw) {
        let lines = cw && bw ? 'Color: ' + pred.color + ' | B/S: ' + pred.bigSmall : cw ? 'Color: ' + pred.color : 'B/S: ' + pred.bigSmall;
        let title = cw && bw ? 'DOUBLE WIN' : cw ? 'COLOR WIN' : 'B/S WIN';
        await bot.sendMessage(chatId, '━━━━━━━━━━━━━━━━━━\n📊 RESULT\n━━━━━━━━━━━━━━━━━━\n\nPeriod: ' + lp.slice(-4) + '\nNumber: ' + an + '\n\n' + lines + '\n\n' + title + '\n━━━━━━━━━━━━━━━━━━');
        await bot.sendMessage(chatId, '🏆');
      }
      autoUsers[userId].pendingPred = null;
    }
    await sendPrediction(userId, lp);
    setTimeout(() => startWatching(userId), 2000);
  } catch(e) { setTimeout(() => startWatching(userId), 3000); }
}

async function sendPrediction(userId, fromPeriod) {
  const chatId = autoUsers[userId].chatId, gameType = autoUsers[userId].gameType || '30S';
  const p = fromPeriod.slice(0,-3), n = parseInt(fromPeriod.slice(-3)), np = p + String(n+1).padStart(3,'0');
  const pred = await ai.predict(gameType), bs = pred.number >= 5 ? 'BIG' : 'SMALL';
  autoUsers[userId].roundCount++;
  autoUsers[userId].pendingPred = { color: pred.color, number: pred.number, bigSmall: bs, period: np };
  db.savePrediction(userId, np, pred.color, pred.number, pred.confidence);
  await bot.sendMessage(chatId, '━━━━━━━━━━━━━━━━━━\n🎯 PREDICTION\n━━━━━━━━━━━━━━━━━━\n\nPeriod: ' + np.slice(-4) + '\nColor: ' + pred.color + '\nB/S: ' + bs + '\nConfidence: ' + pred.confidence + '%\n━━━━━━━━━━━━━━━━━━');
}

bot.on('polling_error', (e) => console.log('Error:', e.message));
process.on('uncaughtException', (e) => console.log('Error:', e.message));
console.log('Bot Ready!');