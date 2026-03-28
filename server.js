require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db/database');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 7860;

// Security headers – allow CDN resources for fonts, charts, icons
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts, please try again later.' },
});

const checkinLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many check-in attempts, please slow down.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/checkin', checkinLimiter);

// Body parsing & cookies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDB();

// Routes
app.use('/api', apiRouter);

// ── Auth middleware for page routes ──────────────────────
function requirePageAuth(req, res, next) {
    const jwt = require('jsonwebtoken');
    const token = req.cookies?.gym_token;
    if (!token) return res.redirect('/admin');
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
        next();
    } catch {
        res.clearCookie('gym_token');
        res.redirect('/admin');
    }
}

// Page routes
app.get('/', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);
app.get('/admin', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
);

// Legacy /dashboard → redirect to new overview page
app.get('/dashboard', requirePageAuth, (_req, res) =>
    res.redirect('/dashboard/overview')
);

// Dashboard sub-pages (each requires auth)
const dashPages = ['overview', 'members', 'payments', 'entry', 'member-form', 'payment-form', 'monthly-detail', 'data-issues', 'settings', 'plan-form'];
dashPages.forEach((page) => {
    app.get(`/dashboard/${page}`, requirePageAuth, (_req, res) =>
        res.sendFile(path.join(__dirname, 'public', 'dashboard', `${page}.html`))
    );
});

// 404 handler
app.use((_req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏋️  44 Fitness Center running → http://localhost:${PORT}`);
});
