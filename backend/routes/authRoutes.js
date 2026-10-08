const express = require("express");
const bcrypt = require("bcryptjs");

const router = express.Router();

module.exports = (db) => {

    // REGISTER
    router.post("/register", async (req, res) => {
        const {
            name,
            email,
            password,
            phone,
            address,
            role,
            organizationName,
            city
        } = req.body;

        // Check required fields
        if (!name || !email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "Name, email, password and role are required."
            });
        }

        const validRoles = ["DONOR", "NGO", "VOLUNTEER", "ADMIN"];
        const normalizedRole = role.toUpperCase();
        if (!validRoles.includes(normalizedRole)) {
            return res.status(400).json({
                success: false,
                message: `Invalid role. Must be one of: ${validRoles.join(", ")}`
            });
        }

        try {
            // Check whether email already exists
            const checkQuery = "SELECT UserID FROM users WHERE Email = ?";

            db.query(checkQuery, [email.trim().toLowerCase()], async (err, results) => {
                if (err) {
                    console.error("Database check error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "Database error during registration.",
                        error: err.message
                    });
                }

                if (results.length > 0) {
                    return res.status(409).json({
                        success: false,
                        message: "This email address is already registered."
                    });
                }

                // Hash password with bcrypt
                const hashedPassword = await bcrypt.hash(password, 10);

                // Insert user into MySQL
                const insertQuery = `
                    INSERT INTO users
                    (Name, Email, Password, Phone, Address, Role,
                     OrganizationName, City, Status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                `;

                db.query(
                    insertQuery,
                    [
                        name.trim(),
                        email.trim().toLowerCase(),
                        hashedPassword,
                        phone ? phone.trim() : null,
                        address ? address.trim() : null,
                        normalizedRole,
                        organizationName ? organizationName.trim() : null,
                        city ? city.trim() : null
                    ],
                    (err, result) => {
                        if (err) {
                            console.error("User insert error:", err);
                            return res.status(500).json({
                                success: false,
                                message: "Failed to create user account.",
                                error: err.message
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: "Registration successful!",
                            user: {
                                id: result.insertId,
                                name: name.trim(),
                                email: email.trim().toLowerCase(),
                                role: normalizedRole,
                                phone: phone ? phone.trim() : null,
                                organizationName: organizationName ? organizationName.trim() : null,
                                city: city ? city.trim() : null
                            }
                        });
                    }
                );
            });

        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({
                success: false,
                message: "Server error during registration.",
                error: error.message
            });
        }
    });

    // LOGIN
    router.post("/login", (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const query = `
            SELECT *
            FROM users
            WHERE Email = ?
            AND Status = 'ACTIVE'
        `;

        db.query(query, [email.trim().toLowerCase()], async (err, results) => {
            if (err) {
                console.error("Login database error:", err);
                return res.status(500).json({
                    success: false,
                    message: "Database error.",
                    error: err.message
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password. Please check your credentials."
                });
            }

            const user = results[0];
            let passwordMatch = false;

            try {
                if (user.Password && (user.Password.startsWith("$2a$") || user.Password.startsWith("$2b$") || user.Password.startsWith("$2y$"))) {
                    passwordMatch = await bcrypt.compare(password, user.Password);
                } else {
                    // Legacy plain-text password check for sample database seeds
                    passwordMatch = (user.Password === password);
                    if (passwordMatch) {
                        // Automatically migrate legacy seed password to bcrypt
                        const updatedHash = await bcrypt.hash(password, 10);
                        db.query("UPDATE users SET Password = ? WHERE UserID = ?", [updatedHash, user.UserID]);
                    }
                }
            } catch (compareErr) {
                console.error("Password comparison error:", compareErr);
                passwordMatch = false;
            }

            if (!passwordMatch) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password. Please check your credentials."
                });
            }

            res.json({
                success: true,
                message: "Login successful.",
                user: {
                    id: user.UserID,
                    name: user.Name,
                    email: user.Email,
                    role: user.Role,
                    phone: user.Phone,
                    address: user.Address,
                    organizationName: user.OrganizationName,
                    city: user.City
                }
            });
        });
    });

    // GET USER PROFILE
    router.get("/profile/:id", (req, res) => {
        const userId = req.params.id;
        const query = `
            SELECT UserID AS id, Name, Email, Phone, Address, Role, OrganizationName, City, Status
            FROM users
            WHERE UserID = ?
        `;

        db.query(query, [userId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "User not found." });
            }
            res.json({ success: true, user: results[0] });
        });
    });

    // GET DEMO ACCOUNTS HELPER
    router.get("/demo-accounts", (req, res) => {
        res.json({
            success: true,
            accounts: [
                { role: "DONOR", email: "abc@restaurant.com", password: "donor123", name: "ABC Restaurant" },
                { role: "DONOR", email: "fresh@bakery.com", password: "donor123", name: "Fresh Bakery" },
                { role: "NGO", email: "hope@ngo.com", password: "ngo123", name: "Hope Foundation" },
                { role: "VOLUNTEER", email: "rahul@volunteer.com", password: "vol123", name: "Rahul Kumar" },
                { role: "ADMIN", email: "admin@foodrescue.com", password: "admin123", name: "Admin User" }
            ]
        });
    });

    return router;
};