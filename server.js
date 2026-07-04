const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const app = express();
app.use(cors()); app.use(express.json());
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => { console.log(req.method + ' ' + req.url); next(); });
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/stats', (req, res) => { try { const u = db.getAllUsers(), p = db.getAllPayments(), uv = Object.values(u); res.json({ totalUsers: uv.length, premiumUsers: uv.filter(x => x.plan === 'premium').length, trialUsers: uv.filter(x => x.plan === 'trial').length, pendingPayments: p.filter(x => x.status === 'pending').length, totalPredictions: uv.reduce((s, x) => s + (x.totalPredictions||0), 0), totalWins: uv.reduce((s, x) => s + (x.wins||0), 0) }); } catch(e) { res.json({ totalUsers:0,premiumUsers:0,trialUsers:0,pendingPayments:0,totalPredictions:0,totalWins:0 }); } });
app.get('/api/users', (req, res) => { try { res.json(Object.values(db.getAllUsers()).map(u => ({ id: String(u.id||''), name: u.firstName||'Unknown', plan: u.plan||'none', predictions: u.totalPredictions||0, wins: u.wins||0, balance: u.balance||0, referralCode: u.referralCode||'' }))); } catch(e) { res.json([]); } });
app.post('/api/users/restart-trial', (req, res) => { try { res.json({ success: db.restartTrial(String(req.body.userId)) }); } catch(e) { res.json({ success: false }); } });
app.post('/api/users/add-premium', (req, res) => { try { res.json({ success: db.setPremium(String(req.body.userId), parseInt(req.body.duration)||30) }); } catch(e) { res.json({ success: false }); } });
app.post('/api/users/remove-premium', (req, res) => { try { res.json({ success: db.removePremium(String(req.body.userId)) }); } catch(e) { res.json({ success: false }); } });
app.delete('/api/users/:userId', (req, res) => { try { res.json({ success: db.deleteUser(String(req.params.userId)) }); } catch(e) { res.json({ success: false }); } });
app.get('/api/payments', (req, res) => { try { res.json(db.getAllPayments()); } catch(e) { res.json([]); } });
app.post('/api/payments/approve', (req, res) => { try { const uid = db.approvePayment(parseInt(req.body.index), 'admin'); res.json({ success: !!uid }); } catch(e) { res.json({ success: false }); } });
app.get('/api/withdrawals', (req, res) => { try { res.json(db.getWithdrawRequests()); } catch(e) { res.json([]); } });
app.get('/api/settings', (req, res) => { try { res.json(db.getSettings()); } catch(e) { res.json({}); } });
app.post('/api/settings', (req, res) => { try { res.json({ success: db.saveSettings(req.body) }); } catch(e) { res.json({ success: false }); } });
app.get('/api/support/users', (req, res) => { try { res.json(db.getAllSupportUsers()); } catch(e) { res.json([]); } });
app.get('/api/support/:userId', (req, res) => { try { res.json(db.getSupportChats(String(req.params.userId))); } catch(e) { res.json([]); } });

app.listen(PORT, () => { console.log('Admin Panel on port ' + PORT); });