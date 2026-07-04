// Bot chalao (background me)
const bot = require('./index.js');

// Admin API chalao
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const app = express();

app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/stats', (req, res) => {
  try {
    const users = db.getAllUsers(); const payments = db.getAllPayments(); const uv = Object.values(users);
    res.json({ totalUsers: uv.length, premiumUsers: uv.filter(u => u.plan === 'premium').length, trialUsers: uv.filter(u => u.plan === 'trial').length, pendingPayments: payments.filter(p => p.status === 'pending').length, pendingWithdraws: db.getWithdrawRequests().filter(w => w.status === 'pending').length, totalPredictions: uv.reduce((s, u) => s + (u.totalPredictions || 0), 0), totalWins: uv.reduce((s, u) => s + (u.wins || 0), 0) });
  } catch(e) { res.json({ totalUsers: 0, premiumUsers: 0, trialUsers: 0, pendingPayments: 0, pendingWithdraws: 0, totalPredictions: 0, totalWins: 0 }); }
});

app.get('/api/users', (req, res) => { try { res.json(Object.values(db.getAllUsers()).map(u => ({ id: String(u.id || ''), name: u.firstName || 'Unknown', plan: u.plan || 'none', predictions: u.totalPredictions || 0, wins: u.wins || 0, losses: u.losses || 0, balance: u.balance || 0, referralEarnings: u.referralEarnings || 0, referralCode: u.referralCode || '', joinedAt: u.joinedAt || '' }))); } catch(e) { res.json([]); } });

app.post('/api/users/restart-trial', (req, res) => { try { res.json({ success: db.restartTrial(String(req.body.userId)) }); } catch(e) { res.json({ success: false }); } });
app.post('/api/users/add-premium', (req, res) => { try { res.json({ success: db.setPremium(String(req.body.userId), parseInt(req.body.duration) || 30) }); } catch(e) { res.json({ success: false }); } });
app.post('/api/users/remove-premium', (req, res) => { try { res.json({ success: db.removePremium(String(req.body.userId)) }); } catch(e) { res.json({ success: false }); } });
app.delete('/api/users/:userId', (req, res) => { try { res.json({ success: db.deleteUser(String(req.params.userId)) }); } catch(e) { res.json({ success: false }); } });

app.get('/api/payments', (req, res) => { try { res.json(db.getAllPayments()); } catch(e) { res.json([]); } });
app.post('/api/payments/approve', (req, res) => { try { const uid = db.approvePayment(parseInt(req.body.index), 'admin'); res.json({ success: !!uid, userId: uid }); } catch(e) { res.json({ success: false }); } });
app.post('/api/payments/reject', (req, res) => { try { res.json({ success: db.rejectPayment(parseInt(req.body.index)) }); } catch(e) { res.json({ success: false }); } });

app.get('/api/withdrawals', (req, res) => { try { res.json(db.getWithdrawRequests()); } catch(e) { res.json([]); } });
app.post('/api/withdrawals/approve', (req, res) => { try { const uid = db.approveWithdraw(parseInt(req.body.index)); res.json({ success: !!uid, userId: uid }); } catch(e) { res.json({ success: false }); } });

app.get('/api/settings', (req, res) => { try { res.json(db.getSettings()); } catch(e) { res.json({}); } });
app.post('/api/settings', (req, res) => { try { res.json({ success: db.saveSettings(req.body) }); } catch(e) { res.json({ success: false }); } });

app.get('/api/support/users', (req, res) => { try { res.json(db.getAllSupportUsers()); } catch(e) { res.json([]); } });
app.get('/api/support/:userId', (req, res) => { try { res.json(db.getSupportChats(String(req.params.userId))); } catch(e) { res.json([]); } });
app.post('/api/support', (req, res) => { try { db.addSupportMessage(String(req.body.userId), req.body.message, 'admin'); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

app.listen(PORT, () => { console.log('Admin Panel running on port ' + PORT); });