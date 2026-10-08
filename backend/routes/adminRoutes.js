const express = require("express");
const router = express.Router();

module.exports = (db) => {

    /* ======================================================================
       1. ADMIN PLATFORM STATS (full analytics)
       GET /api/admin/stats
    ====================================================================== */
    router.get("/admin/stats", (req, res) => {
        const statsQ = `
            SELECT
                (SELECT COUNT(*) FROM users) AS totalUsers,
                (SELECT COUNT(*) FROM users WHERE Role='DONOR') AS totalDonors,
                (SELECT COUNT(*) FROM users WHERE Role='NGO') AS totalNGOs,
                (SELECT COUNT(*) FROM users WHERE Role='VOLUNTEER') AS totalVolunteers,
                (SELECT COUNT(*) FROM food_donation) AS totalDonations,
                (SELECT COUNT(*) FROM food_donation WHERE Status='AVAILABLE') AS availableDonations,
                (SELECT COUNT(*) FROM food_donation WHERE Status='COMPLETED') AS completedDonations,
                (SELECT COUNT(*) FROM food_donation WHERE Status='EXPIRED') AS wastedDonations,
                (SELECT COUNT(*) FROM food_request) AS totalRequests,
                (SELECT COUNT(*) FROM food_request WHERE Status='PENDING') AS pendingRequests,
                (SELECT COUNT(*) FROM food_request WHERE Status='FULFILLED') AS fulfilledRequests,
                (SELECT COUNT(*) FROM donation_allocation) AS totalAllocations,
                (SELECT COUNT(*) FROM pickup_delivery) AS totalDeliveries,
                (SELECT COUNT(*) FROM pickup_delivery WHERE Status='DELIVERED') AS completedDeliveries,
                (SELECT COUNT(*) FROM distribution) AS totalDistributions,
                (SELECT COALESCE(SUM(AllocatedQuantity),0) FROM donation_allocation) AS totalFoodAllocatedKg,
                (SELECT COALESCE(SUM(QuantityDistributed),0) FROM distribution WHERE Status='DISTRIBUTED') AS totalFoodDistributedKg
        `;

        db.query(statsQ, (err, rows) => {
            if (err) {
                console.error("Admin stats error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            // Chart data queries
            const chartQ1 = "SELECT Status, COUNT(*) AS cnt FROM food_donation GROUP BY Status";
            const chartQ2 = "SELECT Priority, COUNT(*) AS cnt FROM food_request GROUP BY Priority";
            const chartQ3 = `
                SELECT DATE_FORMAT(AllocationDate,'%d %b') AS label, COUNT(*) AS cnt
                FROM donation_allocation
                WHERE AllocationDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(AllocationDate), label
                ORDER BY DATE(AllocationDate) ASC
            `;
            const chartQ4 = "SELECT Role, COUNT(*) AS cnt FROM users GROUP BY Role";

            Promise.all([
                new Promise(r => db.query(chartQ1, (e, d) => r(e ? [] : d))),
                new Promise(r => db.query(chartQ2, (e, d) => r(e ? [] : d))),
                new Promise(r => db.query(chartQ3, (e, d) => r(e ? [] : d))),
                new Promise(r => db.query(chartQ4, (e, d) => r(e ? [] : d)))
            ]).then(([donationsByStatus, requestsByPriority, allocationsByDay, usersByRole]) => {
                res.json({
                    success: true,
                    stats: rows[0],
                    charts: { donationsByStatus, requestsByPriority, allocationsByDay, usersByRole }
                });
            });
        });
    });

    /* ======================================================================
       2. USER MANAGEMENT — LIST ALL USERS
       GET /api/admin/users
    ====================================================================== */
    router.get("/admin/users", (req, res) => {
        const query = `
            SELECT UserID, Name, Email, Phone, Role, OrganizationName, City, Status
            FROM users
            ORDER BY Role ASC, Name ASC
        `;
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            res.json({ success: true, users: results, count: results.length });
        });
    });

    /* ======================================================================
       3. TOGGLE USER STATUS (ACTIVE ↔ INACTIVE)
       PUT /api/admin/users/:id/status
    ====================================================================== */
    router.put("/admin/users/:id/status", (req, res) => {
        const userId = Number(req.params.id);
        if (!userId) return res.status(400).json({ success: false, message: "Invalid user ID." });

        db.query("SELECT UserID, Status, Role FROM users WHERE UserID = ?", [userId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "User not found." });
            if (rows[0].Role === "ADMIN") return res.status(403).json({ success: false, message: "Cannot change admin status." });

            const newStatus = rows[0].Status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
            db.query("UPDATE users SET Status = ? WHERE UserID = ?", [newStatus, userId], (err2) => {
                if (err2) return res.status(500).json({ success: false, message: "Database error.", error: err2.message });
                res.json({ success: true, message: `User status changed to ${newStatus}.`, newStatus, userId });
            });
        });
    });

    /* ======================================================================
       4. RECENT ACTIVITY FEED (last 10 events across the platform)
       GET /api/admin/activity
    ====================================================================== */
    router.get("/admin/activity", (req, res) => {
        const query = `
            (SELECT 'Donation' AS type,
                    CONCAT(u.Name, ' donated ', fd.FoodName, ' (', fd.Quantity, ' ', fd.Unit, ')') AS description,
                    fd.CreatedAt AS timestamp,
                    fd.Status AS status
             FROM food_donation fd JOIN users u ON fd.DonorID = u.UserID
             ORDER BY fd.CreatedAt DESC LIMIT 5)
            UNION ALL
            (SELECT 'Request' AS type,
                    CONCAT(u.Name, ' requested ', fr.FoodName, ' (', fr.QuantityRequired, ' ', fr.Unit, ') - ', fr.Priority) AS description,
                    fr.CreatedAt AS timestamp,
                    fr.Status AS status
             FROM food_request fr JOIN users u ON fr.NGOID = u.UserID
             ORDER BY fr.CreatedAt DESC LIMIT 5)
            UNION ALL
            (SELECT 'Allocation' AS type,
                    CONCAT('Allocated ', da.AllocatedQuantity, ' ', fd.Unit, ' of ', fd.FoodName) AS description,
                    da.AllocationDate AS timestamp,
                    da.Status AS status
             FROM donation_allocation da
             JOIN food_donation fd ON da.DonationID = fd.DonationID
             ORDER BY da.AllocationDate DESC LIMIT 5)
            ORDER BY timestamp DESC
            LIMIT 15
        `;
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            res.json({ success: true, activities: results });
        });
    });

    /* ======================================================================
       5. GET/UPDATE USER PROFILE (Phase H)
       GET  /api/profile/:userId
       PUT  /api/profile/:userId
    ====================================================================== */
    router.get("/profile/:userId", (req, res) => {
        const userId = Number(req.params.userId);
        if (!userId) return res.status(400).json({ success: false, message: "Invalid user ID." });

        db.query(
            "SELECT UserID, Name, Email, Phone, Address, Role, OrganizationName, City, Status FROM users WHERE UserID = ?",
            [userId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "User not found." });
                res.json({ success: true, user: rows[0] });
            }
        );
    });

    router.put("/profile/:userId", (req, res) => {
        const userId = Number(req.params.userId);
        if (!userId) return res.status(400).json({ success: false, message: "Invalid user ID." });

        const { name, phone, address, organizationName, city } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Name is required." });
        }

        const updateQuery = `
            UPDATE users
            SET Name = ?, Phone = ?, Address = ?, OrganizationName = ?, City = ?
            WHERE UserID = ?
        `;

        db.query(updateQuery, [
            name.trim(),
            phone || null,
            address || null,
            organizationName || null,
            city || null,
            userId
        ], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found." });
            res.json({ success: true, message: "Profile updated successfully!" });
        });
    });

    /* ======================================================================
       6. CHANGE PASSWORD (Phase H)
       PUT /api/profile/:userId/password
    ====================================================================== */
    router.put("/profile/:userId/password", (req, res) => {
        const userId = Number(req.params.userId);
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Current and new passwords are required." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
        }

        const bcrypt = require("bcryptjs");

        db.query("SELECT Password FROM users WHERE UserID = ?", [userId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "User not found." });

            bcrypt.compare(currentPassword, rows[0].Password, (e, match) => {
                if (e || !match) {
                    return res.status(401).json({ success: false, message: "Current password is incorrect." });
                }
                bcrypt.hash(newPassword, 10, (e2, hash) => {
                    if (e2) return res.status(500).json({ success: false, message: "Error hashing password." });
                    db.query("UPDATE users SET Password = ? WHERE UserID = ?", [hash, userId], (e3) => {
                        if (e3) return res.status(500).json({ success: false, message: "Database error.", error: e3.message });
                        res.json({ success: true, message: "Password changed successfully!" });
                    });
                });
            });
        });
    });

    /* ======================================================================
       7. IN-APP NOTIFICATIONS (Phase I)
       GET /api/notifications/:userId
    ====================================================================== */
    router.get("/notifications/:userId", (req, res) => {
        const userId = Number(req.params.userId);
        if (!userId) return res.status(400).json({ success: false, message: "Invalid user ID." });

        // Get user role first
        db.query("SELECT Role FROM users WHERE UserID = ?", [userId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "User not found." });

            const role = rows[0].Role;
            let notifQuery;
            let params;

            if (role === "DONOR") {
                notifQuery = `
                    SELECT
                        CONCAT('Your donation "', fd.FoodName, '" has been ', LOWER(da.Status)) AS message,
                        da.AllocationDate AS timestamp,
                        CASE WHEN da.Status='ALLOCATED' THEN 'info'
                             WHEN da.Status='DELIVERED' THEN 'success'
                             ELSE 'default' END AS type
                    FROM donation_allocation da
                    JOIN food_donation fd ON da.DonationID = fd.DonationID
                    WHERE fd.DonorID = ?
                    ORDER BY da.AllocationDate DESC
                    LIMIT 10
                `;
                params = [userId];
            } else if (role === "NGO") {
                notifQuery = `
                    SELECT
                        CONCAT('Your request for "', fr.FoodName, '" is now ', LOWER(fr.Status)) AS message,
                        fr.CreatedAt AS timestamp,
                        CASE WHEN fr.Status='ALLOCATED' THEN 'info'
                             WHEN fr.Status='FULFILLED' THEN 'success'
                             WHEN fr.Status='CANCELLED' THEN 'warning'
                             ELSE 'default' END AS type
                    FROM food_request fr
                    WHERE fr.NGOID = ?
                    ORDER BY fr.CreatedAt DESC
                    LIMIT 10
                `;
                params = [userId];
            } else if (role === "VOLUNTEER") {
                notifQuery = `
                    SELECT
                        CONCAT('Delivery #', pd.PickupDeliveryID, ' of "', fd.FoodName, '" is ', LOWER(pd.Status)) AS message,
                        pd.PickupTime AS timestamp,
                        CASE WHEN pd.Status='ASSIGNED' THEN 'info'
                             WHEN pd.Status='DELIVERED' THEN 'success'
                             WHEN pd.Status='CANCELLED' THEN 'warning'
                             ELSE 'default' END AS type
                    FROM pickup_delivery pd
                    JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
                    JOIN food_donation fd ON da.DonationID = fd.DonationID
                    WHERE pd.VolunteerID = ?
                    ORDER BY pd.PickupTime DESC
                    LIMIT 10
                `;
                params = [userId];
            } else {
                // ADMIN — recent system-wide events
                notifQuery = `
                    SELECT
                        CONCAT('New donation: ', fd.FoodName, ' by ', u.Name) AS message,
                        fd.CreatedAt AS timestamp,
                        'info' AS type
                    FROM food_donation fd JOIN users u ON fd.DonorID = u.UserID
                    ORDER BY fd.CreatedAt DESC
                    LIMIT 10
                `;
                params = [];
            }

            db.query(notifQuery, params, (err2, results) => {
                if (err2) return res.status(500).json({ success: false, message: "Database error.", error: err2.message });
                res.json({ success: true, notifications: results, count: results.length });
            });
        });
    });

    return router;
};
