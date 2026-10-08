require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const authRoutes = require("./routes/authRoutes");
const donorRoutes = require("./routes/donorRoutes");
const ngoRoutes = require("./routes/ngoRoutes");
const allocationRoutes = require("./routes/allocationRoutes");
const volunteerRoutes = require("./routes/volunteerRoutes");
const historyRoutes = require("./routes/historyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { checkAndExpireFood } = require("./expiryService");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Run initial food expiration check on startup & repeat every 60 seconds
checkAndExpireFood(db, (err, stats) => {
    if (!err && stats) {
        console.log(`[Expiry Engine Ready] Auto-sweep active. Total wasted items detected: ${stats.totalWasted}`);
    }
});
setInterval(() => {
    checkAndExpireFood(db);
}, 60000);

// Core Middleware — CORS MUST BE FIRST
app.use(
    cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"]
    })
);

// Security Middleware (Helmet)
app.use(
    helmet({
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

// Rate Limiting (Phase J Security) — skip health check & local polling
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Limit each IP to 2000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health" || req.path === "/api/health",
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 15 minutes."
    }
});
app.use("/api", limiter);

app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes(db));
app.use("/api", donorRoutes(db));
app.use("/api", ngoRoutes(db));
app.use("/api", allocationRoutes(db));
app.use("/api", volunteerRoutes(db));
app.use("/api", historyRoutes(db));
app.use("/api", adminRoutes(db));

// Check food expiration on demand
app.all("/api/donations/check-expiry", (req, res) => {
    checkAndExpireFood(db, (err, stats) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Error running expiration sweep.",
                error: err.message
            });
        }
        res.json({
            success: true,
            message: "Food expiration check completed.",
            stats
        });
    });
});

// Home route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Food Rescue Backend is running!",
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint for frontend connection verification
app.get("/api/health", (req, res) => {
    db.query("SELECT 1 AS result", (err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                status: "degraded",
                server: "online",
                database: "disconnected",
                error: err.message,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            status: "healthy",
            server: "online",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    });
});

// Database test endpoint
app.get("/test-db", (req, res) => {
    db.query("SELECT 1 AS result", (err, results) => {
        if (err) {
            console.error("Database test failed:", err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }

        res.json({
            success: true,
            message: "MySQL database is connected!",
            result: results
        });
    });
});

// Start server
const server = app.listen(PORT, HOST, () => {
    console.log(`Server running at http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});

module.exports = { app, server };