const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler, DATE_RE, addDays, todayStr, nowTimeStr, getPlanDays } = require('./api.helpers');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
    const { phone } = req.body;
    if (!phone || String(phone).trim() === '')
        return res.status(400).json({ error: 'Phone number is required' });

    const phoneNum = String(phone).trim();
    if (!/^\d{10}$/.test(phoneNum))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });

    const db = getDB();
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

    res.json({
        success: true,
        message: `Welcome back, ${member.Name.trim()}!`,
        name: member.Name.trim(),
        time,
        expiresOn: expiryDate,
    });
}));

module.exports = router;
