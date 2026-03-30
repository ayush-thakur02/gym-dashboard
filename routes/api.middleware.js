const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function safeCompare(a, b) {
    const bA = Buffer.from(String(a));
    const bB = Buffer.from(String(b));
    if (bA.length !== bB.length) { crypto.timingSafeEqual(bA, bA); return false; }
    return crypto.timingSafeEqual(bA, bB);
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

module.exports = { safeCompare, requireAuth };
