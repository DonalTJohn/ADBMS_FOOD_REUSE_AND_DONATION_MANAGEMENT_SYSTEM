const express = require("express");

const router = express.Router();

const { checkAndExpireFood } = require("../expiryService");

module.exports = (db) => {
    // GET DONATIONS BY DONOR (with real-time expiry check and waste stats)
    router.get("/donations/donor/:donorId", (req, res) => {
        const donorId = req.params.donorId;

        checkAndExpireFood(db, () => {
            const query = `
                SELECT
                    DonationID,
                    DonorID,
                    FoodName,
                    FoodType,
                    Quantity,
                    Unit,
                    PreparedAt,
                    ExpiryAt,
                    PickupLocation,
                    Status,
                    CreatedAt
                FROM food_donation
                WHERE DonorID = ?
                ORDER BY CreatedAt DESC
            `;

            db.query(query, [donorId], (err, results) => {
                if (err) {
                    console.error("Error fetching donations:", err);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to fetch donations.",
                        error: err.message
                    });
                }

                const total = results.length;
                const available = results.filter(d => d.Status === 'AVAILABLE').length;
                const allocated = results.filter(d => d.Status === 'ALLOCATED').length;
                const completed = results.filter(d => d.Status === 'COMPLETED').length;
                const wasted = results.filter(d => d.Status === 'EXPIRED').length;
                const cancelled = results.filter(d => d.Status === 'CANCELLED').length;

                res.json({
                    success: true,
                    count: results.length,
                    stats: {
                        total,
                        available,
                        allocated,
                        completed,
                        wasted,
                        cancelled
                    },
                    donations: results
                });
            });
        });
    });

    // ADD FOOD DONATION
    router.post("/donations", (req, res) => {

        const {
            donorId,
            foodName,
            foodType,
            quantity,
            unit,
            preparedAt,
            expiryAt,
            pickupLocation
        } = req.body;

        // Check required fields
        if (
            !donorId ||
            !foodName ||
            !quantity ||
            !unit ||
            !expiryAt ||
            !pickupLocation
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required donation details."
            });
        }

        // Insert donation into database
        const query = `
            INSERT INTO food_donation
            (
                DonorID,
                FoodName,
                FoodType,
                Quantity,
                Unit,
                PreparedAt,
                ExpiryAt,
                PickupLocation,
                Status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')
        `;

        db.query(
            query,
            [
                donorId,
                foodName,
                foodType || null,
                quantity,
                unit,
                preparedAt || null,
                expiryAt,
                pickupLocation
            ],
            (err, result) => {

                if (err) {
                    console.error("Donation error:", err);

                    return res.status(500).json({
                        success: false,
                        message: "Failed to add food donation.",
                        error: err.message
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Food donation added successfully.",
                    donationId: result.insertId
                });
            }
        );
    });

    // GET AVAILABLE FOOD DONATIONS
    router.get("/donations/available", (req, res) => {
        const query = `
            SELECT
                DonationID,
                DonorID,
                FoodName,
                FoodType,
                Quantity,
                Unit,
                PreparedAt,
                ExpiryAt,
                PickupLocation,
                Status,
                CreatedAt
            FROM food_donation
            WHERE Status = 'AVAILABLE'
            AND ExpiryAt > NOW()
            ORDER BY ExpiryAt ASC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Error fetching available food:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch available food.",
                    error: err.message
                });
            }

            res.json({
                success: true,
                count: results.length,
                donations: results
            });
        });
    });

    // CHECK & EXPIRE FOOD (Manual or Scheduled trigger)
    router.all("/donations/check-expiry", (req, res) => {
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

    // GET DONATION BY ID
    router.get("/donations/:id", (req, res) => {
        const donationId = req.params.id;

        const query = `
            SELECT
                fd.DonationID,
                fd.DonorID,
                fd.FoodName,
                fd.FoodType,
                fd.Quantity,
                fd.Unit,
                fd.PreparedAt,
                fd.ExpiryAt,
                fd.PickupLocation,
                fd.Status,
                fd.CreatedAt,
                u.Name AS DonorName,
                u.Phone AS DonorPhone,
                u.OrganizationName
            FROM food_donation fd
            JOIN users u ON fd.DonorID = u.UserID
            WHERE fd.DonationID = ?
        `;

        db.query(query, [donationId], (err, results) => {
            if (err) {
                console.error("Error fetching donation:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch donation details.",
                    error: err.message
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Donation not found."
                });
            }

            res.json({
                success: true,
                donation: results[0]
            });
        });
    });

    // UPDATE FOOD DONATION
    router.put("/donations/:id", (req, res) => {
        const donationId = req.params.id;
        const {
            foodName,
            foodType,
            quantity,
            unit,
            preparedAt,
            expiryAt,
            pickupLocation
        } = req.body;

        // Check if donation exists and is in AVAILABLE status
        const checkQuery = "SELECT Status FROM food_donation WHERE DonationID = ?";
        db.query(checkQuery, [donationId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Donation not found." });
            }

            if (results[0].Status !== "AVAILABLE") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot edit donation with status '${results[0].Status}'. Only AVAILABLE donations can be edited.`
                });
            }

            const updateQuery = `
                UPDATE food_donation
                SET
                    FoodName = COALESCE(?, FoodName),
                    FoodType = COALESCE(?, FoodType),
                    Quantity = COALESCE(?, Quantity),
                    Unit = COALESCE(?, Unit),
                    PreparedAt = COALESCE(?, PreparedAt),
                    ExpiryAt = COALESCE(?, ExpiryAt),
                    PickupLocation = COALESCE(?, PickupLocation)
                WHERE DonationID = ?
            `;

            db.query(
                updateQuery,
                [
                    foodName || null,
                    foodType || null,
                    quantity || null,
                    unit || null,
                    preparedAt || null,
                    expiryAt || null,
                    pickupLocation || null,
                    donationId
                ],
                (err, updateResult) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: "Failed to update donation.",
                            error: err.message
                        });
                    }

                    res.json({
                        success: true,
                        message: "Food donation updated successfully.",
                        donationId: Number(donationId)
                    });
                }
            );
        });
    });

    // CANCEL FOOD DONATION (PUT /api/donations/:id/cancel or DELETE /api/donations/:id)
    const cancelHandler = (req, res) => {
        const donationId = req.params.id;

        const checkQuery = "SELECT Status FROM food_donation WHERE DonationID = ?";
        db.query(checkQuery, [donationId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Donation not found." });
            }

            if (results[0].Status !== "AVAILABLE") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel donation in '${results[0].Status}' status. Only AVAILABLE donations can be cancelled.`
                });
            }

            const cancelQuery = "UPDATE food_donation SET Status = 'CANCELLED' WHERE DonationID = ?";
            db.query(cancelQuery, [donationId], (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: "Failed to cancel donation.",
                        error: err.message
                    });
                }

                res.json({
                    success: true,
                    message: "Food donation has been cancelled successfully.",
                    donationId: Number(donationId)
                });
            });
        });
    };

    router.put("/donations/:id/cancel", cancelHandler);
    router.delete("/donations/:id", cancelHandler);

    return router;
};