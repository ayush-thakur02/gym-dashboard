const express = require('express');
const jwt = require('jsonwebtoken');
const { safeCompare, requireAuth } = require('./api.middleware');

const router = express.Router();

router.post('/login', (req, res) => {
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

router.post('/logout', (_req, res) => {
    res.clearCookie('gym_token', { path: '/' });
    res.json({ success: true });
});

router.get('/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.admin.username });
});

module.exports = router;
