const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');

const router = express.Router();

const VALID_MODES = ['Cash', 'UPI', 'Card', 'Online', 'Other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeCompare(a, b) {
    const bA = Buffer.from(String(a));
    const bB = Buffer.from(String(b));
    if (bA.length !== bB.length) { crypto.timingSafeEqual(bA, bA); return false; }
    return crypto.timingSafeEqual(bA, bB);
}

async function getPlanDays(amount) {
    const [[plan]] = await getDB().execute(
        'SELECT duration_days FROM plans WHERE amount = ? AND is_active = 1',
        [Number(amount)]
    );
    return plan ? plan.duration_days : null;
}

async function getActivePlanAmounts() {
    const [rows] = await getDB().execute('SELECT amount FROM plans WHERE is_active = 1');
    return rows.map(r => r.amount);
}

function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
}

function todayStr() {
    return toDateStr(new Date());
}

function nowTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function requireAuth(req, res, next) {
    const token =
        req.cookies?.gym_token ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : null);

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        req.admin = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('gym_token', { path: '/' });
        return res.status(401).json({ error: 'Session expired' });
    }
}


router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });

    if (typeof username !== 'string' || typeof password !== 'string')
        return res.status(400).json({ error: 'Invalid input' });

    const envUsername = process.env.ADMIN_USERNAME || 'admin';
    const envPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const valid = safeCompare(username.trim(), envUsername) && safeCompare(password, envPassword);
    if (!valid)
        return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: 1, username: envUsername },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.cookie('gym_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
    });

    res.json({ success: true, username: envUsername });
});

router.post('/auth/logout', (_req, res) => {
    res.clearCookie('gym_token', { path: '/' });
    res.json({ success: true });
});

router.get('/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.admin.username });
});


router.post('/checkin', async (req, res) => {
    const { phone } = req.body;
    if (!phone || String(phone).trim() === '')
        return res.status(400).json({ error: 'Phone number is required' });

    const db = getDB();
    const phoneNum = String(phone).trim();

    if (!/^\d{10}$/.test(phoneNum))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });

    const [[member]] = await db.execute('SELECT * FROM members WHERE Phone = ?', [phoneNum]);
    if (!member)
        return res.status(404).json({ error: 'Member not found. Please register first.' });

    const [[payment]] = await db.execute(
        'SELECT * FROM payments WHERE Phone = ? ORDER BY Date DESC LIMIT 1',
        [phoneNum]
    );

    if (!payment)
        return res.status(403).json({ error: 'No payment found. Please make payment first.' });

    const days = await getPlanDays(payment.Money);
    if (!days)
        return res.status(500).json({ error: 'Unrecognized plan amount. Please contact admin.' });

    const expiryDate = addDays(payment.Date, days);
    const today = todayStr();

    if (today > expiryDate)
        return res.status(403).json({
            error: `Membership expired on ${expiryDate}. Please renew to enter.`,
        });

    const [[alreadyIn]] = await db.execute(
        'SELECT 1 FROM daily_entry WHERE Phone = ? AND Date = ?',
        [phoneNum, today]
    );

    if (alreadyIn)
        return res.status(409).json({ error: 'You have already checked in today.' });

    const time = nowTimeStr();
    await db.execute(
        'INSERT INTO daily_entry (Name, Phone, Date, Time) VALUES (?, ?, ?, ?)',
        [member.Name, phoneNum, today, time]
    );

    res.json({ success: true, message: `Welcome back, ${member.Name.trim()}!`, name: member.Name.trim(), time, expiresOn: expiryDate });
});

router.get('/stats', requireAuth, async (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const lastOfMonth = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

    const [[{ c: totalMembers }]] = await db.execute('SELECT COUNT(*) AS c FROM members');
    const [[{ c: todayEntries }]] = await db.execute(
        'SELECT COUNT(*) AS c FROM daily_entry WHERE Date = ?', [today]
    );
    const [[{ s: monthlyRevenue }]] = await db.execute(
        'SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ? AND Date <= ?',
        [firstOfMonth, lastOfMonth]
    );
    const [[{ c: activeMembers }]] = await db.execute(
        'SELECT COUNT(DISTINCT Phone) AS c FROM daily_entry WHERE Date >= ?', [firstOfMonth]
    );

    res.json({ totalMembers, todayEntries, monthlyRevenue: Number(monthlyRevenue), activeMembers });
});

router.get('/stats/hourly', requireAuth, async (req, res) => {
    const date = req.query.date || todayStr();
    if (!DATE_RE.test(date))
        return res.status(400).json({ error: 'Invalid date' });
    const db = getDB();
    const [rows] = await db.execute(
        'SELECT HOUR(Time) AS hour, COUNT(*) AS count FROM daily_entry WHERE Date = ? GROUP BY hour ORDER BY hour',
        [date]
    );
    res.json(rows);
});

router.get('/stats/monthly', requireAuth, async (_req, res) => {
    const db = getDB();
    const [rows] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS count FROM daily_entry WHERE Date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 11 MONTH), '%Y-%m-01') GROUP BY month ORDER BY month"
    );
    res.json(rows);
});

router.get('/stats/monthly-detail', requireAuth, async (_req, res) => {
    const db = getDB();
    const [checkins] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS checkins FROM daily_entry GROUP BY month ORDER BY month"
    );
    const [revenue] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS payments, SUM(Money) AS revenue FROM payments GROUP BY month ORDER BY month"
    );

    const monthSet = new Set([
        ...checkins.map(r => r.month),
        ...revenue.map(r => r.month),
    ]);
    const months = Array.from(monthSet).sort();

    const checkinMap = Object.fromEntries(checkins.map(r => [r.month, r.checkins]));
    const revenueMap = Object.fromEntries(revenue.map(r => [r.month, { payments: r.payments, revenue: Number(r.revenue) }]));

    const rows = months.map(m => ({
        month: m,
        checkins: checkinMap[m] || 0,
        payments: revenueMap[m]?.payments || 0,
        revenue: revenueMap[m]?.revenue || 0,
    }));

    res.json(rows);
});

router.get('/members', requireAuth, async (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const [[{ c: total }]] = await db.execute(
        'SELECT COUNT(*) AS c FROM members WHERE Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?',
        [search, search]
    );
    const [rows] = await db.execute(
        'SELECT * FROM members WHERE Name LIKE ? OR CAST(Phone AS CHAR) LIKE ? ORDER BY ID DESC LIMIT ? OFFSET ?',
        [search, search, limit, offset]
    );
    res.json({ rows, total, page, limit });
});

router.get('/members/by-id/:id', requireAuth, async (req, res) => {
    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE ID = ?', [Number(req.params.id)]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
});

router.get('/members/:phone', requireAuth, async (req, res) => {
    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE Phone = ?', [req.params.phone]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
});

router.post('/members', requireAuth, async (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
    if (firstName.trim().length > 50)
        return res.status(400).json({ error: 'First name is too long' });
    if ((lastName || '').trim().length > 50)
        return res.status(400).json({ error: 'Last name is too long' });
    if (dob && !DATE_RE.test(dob))
        return res.status(400).json({ error: 'Invalid date of birth format' });
    if (emergencyPhone && !/^\d{10}$/.test(String(emergencyPhone)))
        return res.status(400).json({ error: 'Emergency phone must be 10 digits' });
    if ((address || '').trim().length > 300)
        return res.status(400).json({ error: 'Address is too long' });

    const db = getDB();
    const [[existing]] = await db.execute('SELECT 1 FROM members WHERE Phone = ?', [phoneStr]);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    const [result] = await db.execute(
        'INSERT INTO members (Name, Phone, Emergency_Phone, DOB, Address) VALUES (?, ?, ?, ?, ?)',
        [name, phoneStr, emergencyPhone || 0, dob || null, addr]
    );

    res.status(201).json({ success: true, id: result.insertId, name });
});

router.put('/members/:id', requireAuth, async (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
    if (firstName.trim().length > 50)
        return res.status(400).json({ error: 'First name is too long' });
    if ((lastName || '').trim().length > 50)
        return res.status(400).json({ error: 'Last name is too long' });
    if (dob && !DATE_RE.test(dob))
        return res.status(400).json({ error: 'Invalid date of birth format' });
    if (emergencyPhone && !/^\d{10}$/.test(String(emergencyPhone)))
        return res.status(400).json({ error: 'Emergency phone must be 10 digits' });
    if ((address || '').trim().length > 300)
        return res.status(400).json({ error: 'Address is too long' });

    const db = getDB();
    const memberId = Number(req.params.id);
    const [[member]] = await db.execute('SELECT * FROM members WHERE ID = ?', [memberId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const [[conflict]] = await db.execute(
        'SELECT 1 FROM members WHERE Phone = ? AND ID != ?', [phoneStr, memberId]
    );
    if (conflict) return res.status(409).json({ error: 'Phone number already used by another member' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    await db.execute(
        'UPDATE members SET Name = ?, Phone = ?, Emergency_Phone = ?, DOB = ?, Address = ? WHERE ID = ?',
        [name, phoneStr, emergencyPhone || 0, dob || null, addr, memberId]
    );

    if (name !== member.Name || phoneStr !== String(member.Phone)) {
        await db.execute('UPDATE payments SET Phone = ?, Name = ? WHERE Phone = ?', [phoneStr, name, member.Phone]);
        await db.execute('UPDATE daily_entry SET Phone = ?, Name = ? WHERE Phone = ?', [phoneStr, name, member.Phone]);
    }
    res.json({ success: true });
});

router.get('/payments', requireAuth, async (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const mode = req.query.mode || '';
    const month = req.query.month || '';   // '01'..'12'
    const year = req.query.year || '';   // '2024'
    const amount = req.query.amount || '';   // exact amount value
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = ['(Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?)'];
    const params = [search, search];

    if (mode) { conditions.push('Mode = ?'); params.push(mode); }
    if (year) { conditions.push('YEAR(Date) = ?'); params.push(year); }
    if (month) { conditions.push("DATE_FORMAT(Date, '%m') = ?"); params.push(month); }
    if (amount) { conditions.push('Money = ?'); params.push(Number(amount)); }

    const where = conditions.join(' AND ');
    const [[{ c: total }]] = await db.execute(`SELECT COUNT(*) AS c FROM payments WHERE ${where}`, params);
    const [rows] = await db.execute(`SELECT * FROM payments WHERE ${where} ORDER BY Date DESC, ID DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ rows, total, page, limit });
});

router.get('/payments/:id', requireAuth, async (req, res) => {
    const db = getDB();
    const payId = Number(req.params.id);
    if (!Number.isInteger(payId) || payId <= 0)
        return res.status(400).json({ error: 'Invalid payment ID' });
    const [[pay]] = await db.execute('SELECT * FROM payments WHERE ID = ?', [payId]);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });
    res.json(pay);
});

router.post('/payments', requireAuth, async (req, res) => {
    const { phone, amount, date, mode } = req.body;

    if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' });
    if (!amount) return res.status(400).json({ error: 'Amount is required' });
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!mode) return res.status(400).json({ error: 'Payment mode is required' });

    if (!DATE_RE.test(date))
        return res.status(400).json({ error: 'Invalid date format' });
    if (!VALID_MODES.includes(mode))
        return res.status(400).json({ error: 'Invalid payment mode' });
    if (!(await getActivePlanAmounts()).includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE Phone = ?', [phone.trim()]);
    if (!member) return res.status(404).json({ error: 'Member not found. Register first.' });

    await db.execute(
        'INSERT INTO payments (Name, Date, Phone, Mode, Money) VALUES (?, ?, ?, ?, ?)',
        [member.Name, date, phone.trim(), mode, Number(amount)]
    );

    res.status(201).json({ success: true, name: member.Name });
});

router.put('/payments/:id', requireAuth, async (req, res) => {
    const { amount, date, mode } = req.body;
    const db = getDB();
    const payId = Number(req.params.id);

    if (!Number.isInteger(payId) || payId <= 0)
        return res.status(400).json({ error: 'Invalid payment ID' });
    if (!date || !DATE_RE.test(date))
        return res.status(400).json({ error: 'Invalid date format' });
    if (!mode || !VALID_MODES.includes(mode))
        return res.status(400).json({ error: 'Invalid payment mode' });

    const [[pay]] = await db.execute('SELECT 1 FROM payments WHERE ID = ?', [payId]);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });

    if (!(await getActivePlanAmounts()).includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    await db.execute(
        'UPDATE payments SET Date = ?, Mode = ?, Money = ? WHERE ID = ?',
        [date, mode, Number(amount), payId]
    );

    res.json({ success: true });
});


router.get('/entry', requireAuth, async (req, res) => {
    const db = getDB();
    const { filter, date, month, year, search } = req.query;
    const today = todayStr();

    let start, end;

    if (filter === 'month' && month && year) {
        const m = Number(month);
        const y = Number(year);
        if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
            start = `${y}-${String(m).padStart(2, '0')}-01`;
            const last = new Date(y, m, 0);
            end = toDateStr(last);
        } else {
            start = today;
            end = today;
        }
    } else if (filter === 'date' && date && DATE_RE.test(date)) {
        start = date;
        end = date;
    } else {
        start = today;
        end = today;
    }

    const searchParam = `%${search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ c: total }]] = await db.execute(
        `SELECT COUNT(*) AS c FROM daily_entry
         WHERE (Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?)
           AND Date >= ? AND Date <= ?`,
        [searchParam, searchParam, start, end]
    );

    const [rows] = await db.execute(
        `SELECT * FROM daily_entry
         WHERE (Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?)
           AND Date >= ? AND Date <= ?
         ORDER BY Date DESC, Sno DESC LIMIT ? OFFSET ?`,
        [searchParam, searchParam, start, end, limit, offset]
    );

    res.json({ rows, total, page, limit, start, end });
});

router.get('/stats/extended', requireAuth, async (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const firstOfYear = today.slice(0, 4) + '-01-01';
    const lastOfMonth = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

    const [[{ c: newThisMonth }]] = await db.execute(`
        SELECT COUNT(DISTINCT p.Phone) AS c FROM payments p
        WHERE p.Date >= ? AND p.Date <= ?
          AND NOT EXISTS (
              SELECT 1 FROM payments p2
              WHERE p2.Phone = p.Phone AND p2.Date < ?
          )
    `, [firstOfMonth, lastOfMonth, firstOfMonth]);

    const [topMembers] = await db.execute(`
        SELECT Name, Phone, COUNT(*) AS visits
        FROM daily_entry
        WHERE Date >= ? AND Date <= ?
        GROUP BY Phone
        ORDER BY visits DESC
        LIMIT 5
    `, [firstOfMonth, lastOfMonth]);

    const [revenueByMode] = await db.execute(`
        SELECT Mode, COALESCE(SUM(Money), 0) AS total, COUNT(*) AS txn
        FROM payments
        WHERE Date >= ? AND Date <= ?
        GROUP BY Mode
    `, [firstOfMonth, lastOfMonth]);
    revenueByMode.forEach(r => { r.total = Number(r.total); });

    const [[checkinStats]] = await db.execute(`
        SELECT COUNT(*) AS total, COUNT(DISTINCT Date) AS days
        FROM daily_entry WHERE Date >= ? AND Date <= ?
    `, [firstOfMonth, today]);
    const avgDaily = checkinStats.days > 0
        ? (checkinStats.total / checkinStats.days).toFixed(1)
        : 0;

    const [[{ s: ytdRevenue }]] = await db.execute(
        'SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ?', [firstOfYear]
    );

    res.json({ newThisMonth, topMembers, revenueByMode, avgDailyCheckins: Number(avgDaily), ytdRevenue: Number(ytdRevenue) });
});

router.get('/stats/expiring', requireAuth, async (req, res) => {
    const db = getDB();
    const today = todayStr();
    const daysAhead = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
    const future = new Date(today + 'T00:00:00');
    future.setDate(future.getDate() + daysAhead);
    const futureStr = toDateStr(future);

    const [lastPayments] = await db.execute(`
        SELECT p.Name, p.Phone, p.Date, p.Money
        FROM payments p
        INNER JOIN (
            SELECT Phone, MAX(Date) AS maxDate FROM payments GROUP BY Phone
        ) latest ON p.Phone = latest.Phone AND p.Date = latest.maxDate
    `);

    const [planRows] = await db.execute('SELECT amount, duration_days FROM plans');
    const planDaysMap = Object.fromEntries(planRows.map(r => [r.amount, r.duration_days]));

    const expiring = lastPayments
        .filter(p => {
            const d = planDaysMap[p.Money];
            if (!d) return false;
            const expiry = addDays(p.Date, d);
            return expiry >= today && expiry <= futureStr;
        })
        .map(p => ({
            Name: p.Name,
            Phone: p.Phone,
            expiryDate: addDays(p.Date, planDaysMap[p.Money]),
        }))
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    res.json(expiring);
});

router.get('/entry/daily-counts', requireAuth, async (req, res) => {
    const db = getDB();
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0);
    const end = toDateStr(last);

    const [rows] = await db.execute(
        'SELECT Date, COUNT(*) AS count FROM daily_entry WHERE Date >= ? AND Date <= ? GROUP BY Date ORDER BY Date',
        [start, end]
    );

    res.json({ rows, start, end });
});


router.get('/data-issues', requireAuth, async (_req, res) => {
    const db = getDB();
    const [rows] = await db.execute(`
            SELECT di.*, m.Name, m.Address
            FROM data_issues di
            LEFT JOIN members m ON di.table_name = 'members' AND di.record_id = m.ID
            ORDER BY di.id DESC
        `);
    res.json(rows);
});

router.delete('/data-issues/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ error: 'Invalid ID' });
    const db = getDB();
    await db.execute('DELETE FROM data_issues WHERE id = ?', [id]);
    res.json({ success: true });
});


router.get('/plans', requireAuth, async (_req, res) => {
    const db = getDB();
    const [plans] = await db.execute('SELECT * FROM plans ORDER BY category, amount');
    res.json(plans);
});

router.get('/plans/:id', requireAuth, async (req, res) => {
    const db = getDB();
    const [[plan]] = await db.execute('SELECT * FROM plans WHERE ID = ?', [Number(req.params.id)]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
});

router.post('/plans', requireAuth, async (req, res) => {
    const { label, amount, duration_days, category } = req.body;

    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (label.trim().length > 100) return res.status(400).json({ error: 'Label is too long' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (Number(amount) > 1000000)
        return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });
    if (Number(duration_days) > 3650)
        return res.status(400).json({ error: 'Duration cannot exceed 3650 days' });
    if ((category || '').trim().length > 100)
        return res.status(400).json({ error: 'Category is too long' });

    const db = getDB();
    const [result] = await db.execute(
        'INSERT INTO plans (label, amount, duration_days, category, is_active) VALUES (?, ?, ?, ?, 1)',
        [label.trim(), Number(amount), Number(duration_days), (category || 'General').trim()]
    );

    res.status(201).json({ success: true, id: result.insertId });
});

router.put('/plans/:id', requireAuth, async (req, res) => {
    const { label, amount, duration_days, category, is_active } = req.body;
    const planId = Number(req.params.id);

    if (!Number.isInteger(planId) || planId <= 0)
        return res.status(400).json({ error: 'Invalid plan ID' });
    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (label.trim().length > 100) return res.status(400).json({ error: 'Label is too long' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (Number(amount) > 1000000)
        return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });
    if (Number(duration_days) > 3650)
        return res.status(400).json({ error: 'Duration cannot exceed 3650 days' });
    if ((category || '').trim().length > 100)
        return res.status(400).json({ error: 'Category is too long' });

    const db = getDB();
    const [[plan]] = await db.execute('SELECT * FROM plans WHERE ID = ?', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const oldAmount = plan.amount;
    const newAmount = Number(amount);

    const con = await db.getConnection();
    try {
        await con.beginTransaction();
        await con.execute(
            'UPDATE plans SET label = ?, amount = ?, duration_days = ?, category = ?, is_active = ? WHERE ID = ?',
            [label.trim(), newAmount, Number(duration_days), (category || 'General').trim(), is_active ? 1 : 0, planId]
        );
        if (oldAmount !== newAmount) {
            await con.execute('UPDATE payments SET Money = ? WHERE Money = ?', [newAmount, oldAmount]);
        }
        await con.commit();
    } catch (err) {
        await con.rollback();
        throw err;
    } finally {
        con.release();
    }

    res.json({ success: true });
});

router.delete('/plans/:id', requireAuth, async (req, res) => {
    const planId = Number(req.params.id);
    if (!Number.isInteger(planId) || planId <= 0)
        return res.status(400).json({ error: 'Invalid plan ID' });
    const db = getDB();
    const [[plan]] = await db.execute('SELECT 1 FROM plans WHERE ID = ?', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    await db.execute('DELETE FROM plans WHERE ID = ?', [planId]);
    res.json({ success: true });
});

module.exports = router;
