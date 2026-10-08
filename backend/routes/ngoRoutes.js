const express = require("express");

const router = express.Router();

module.exports = (db) => {

    // CREATE FOOD REQUEST
    router.post("/requests", (req, res) => {
        const {
            ngoId,
            foodName,
            foodType,
            quantityRequired,
            unit,
            requiredBy,
            priority,
            deliveryLocation
        } = req.body;

        // Check required fields
        if (
            !ngoId ||
            !foodName ||
            !quantityRequired ||
            !unit ||
            !requiredBy ||
            !deliveryLocation
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required request details (foodName, quantityRequired, unit, requiredBy, deliveryLocation)."
            });
        }

        const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
        const normalizedPriority = priority ? priority.toUpperCase() : "MEDIUM";
        const finalPriority = validPriorities.includes(normalizedPriority) ? normalizedPriority : "MEDIUM";

        // Insert request into database
        const query = `
            INSERT INTO food_request
            (
                NGOID,
                FoodName,
                FoodType,
                QuantityRequired,
                Unit,
                RequiredBy,
                Priority,
                DeliveryLocation,
                Status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `;

        db.query(
            query,
            [
                ngoId,
                foodName.trim(),
                foodType || "Any / General",
                quantityRequired,
                unit,
                requiredBy,
                finalPriority,
                deliveryLocation.trim()
            ],
            (err, result) => {
                if (err) {
                    console.error("Food request error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to create food request.",
                        error: err.message
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Food request created successfully.",
                    requestId: result.insertId
                });
            }
        );
    });

    // GET ALL REQUESTS BY NGO
    router.get("/requests/ngo/:ngoId", (req, res) => {
        const ngoId = req.params.ngoId;

        const query = `
            SELECT
                RequestID,
                NGOID,
                FoodName,
                FoodType,
                QuantityRequired,
                Unit,
                RequiredBy,
                Priority,
                DeliveryLocation,
                Status,
                CreatedAt
            FROM food_request
            WHERE NGOID = ?
            ORDER BY CreatedAt DESC
        `;

        db.query(query, [ngoId], (err, results) => {
            if (err) {
                console.error("Error fetching NGO requests:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch NGO requests.",
                    error: err.message
                });
            }

            res.json({
                success: true,
                count: results.length,
                requests: results
            });
        });
    });

    // GET ALL PENDING / AVAILABLE REQUESTS (ACROSS ALL NGOS)
    router.get("/requests/pending", (req, res) => {
        const query = `
            SELECT
                fr.RequestID,
                fr.NGOID,
                fr.FoodName,
                fr.FoodType,
                fr.QuantityRequired,
                fr.Unit,
                fr.RequiredBy,
                fr.Priority,
                fr.DeliveryLocation,
                fr.Status,
                fr.CreatedAt,
                u.Name AS NGOName,
                u.OrganizationName,
                u.Phone AS NGOPhone
            FROM food_request fr
            JOIN users u ON fr.NGOID = u.UserID
            WHERE fr.Status = 'PENDING'
            AND fr.RequiredBy > NOW()
            ORDER BY 
                CASE fr.Priority
                    WHEN 'URGENT' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    WHEN 'LOW' THEN 4
                    ELSE 5
                END,
                fr.RequiredBy ASC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Error fetching pending requests:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch pending requests.",
                    error: err.message
                });
            }

            res.json({
                success: true,
                count: results.length,
                requests: results
            });
        });
    });

    // GET REQUEST BY ID
    router.get("/requests/:id", (req, res) => {
        const requestId = req.params.id;

        const query = `
            SELECT
                fr.RequestID,
                fr.NGOID,
                fr.FoodName,
                fr.FoodType,
                fr.QuantityRequired,
                fr.Unit,
                fr.RequiredBy,
                fr.Priority,
                fr.DeliveryLocation,
                fr.Status,
                fr.CreatedAt,
                u.Name AS NGOName,
                u.OrganizationName,
                u.Phone AS NGOPhone,
                u.Email AS NGOEmail
            FROM food_request fr
            JOIN users u ON fr.NGOID = u.UserID
            WHERE fr.RequestID = ?
        `;

        db.query(query, [requestId], (err, results) => {
            if (err) {
                console.error("Error fetching request details:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch request details.",
                    error: err.message
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Food request not found."
                });
            }

            res.json({
                success: true,
                request: results[0]
            });
        });
    });

    // UPDATE FOOD REQUEST
    router.put("/requests/:id", (req, res) => {
        const requestId = req.params.id;
        const {
            foodName,
            foodType,
            quantityRequired,
            unit,
            requiredBy,
            priority,
            deliveryLocation
        } = req.body;

        const checkQuery = "SELECT Status FROM food_request WHERE RequestID = ?";
        db.query(checkQuery, [requestId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Request not found." });
            }

            if (results[0].Status !== "PENDING") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot edit request with status '${results[0].Status}'. Only PENDING requests can be modified.`
                });
            }

            const updateQuery = `
                UPDATE food_request
                SET
                    FoodName = COALESCE(?, FoodName),
                    FoodType = COALESCE(?, FoodType),
                    QuantityRequired = COALESCE(?, QuantityRequired),
                    Unit = COALESCE(?, Unit),
                    RequiredBy = COALESCE(?, RequiredBy),
                    Priority = COALESCE(?, Priority),
                    DeliveryLocation = COALESCE(?, DeliveryLocation)
                WHERE RequestID = ?
            `;

            db.query(
                updateQuery,
                [
                    foodName || null,
                    foodType || null,
                    quantityRequired || null,
                    unit || null,
                    requiredBy || null,
                    priority || null,
                    deliveryLocation || null,
                    requestId
                ],
                (err) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: "Failed to update food request.",
                            error: err.message
                        });
                    }

                    res.json({
                        success: true,
                        message: "Food request updated successfully.",
                        requestId: Number(requestId)
                    });
                }
            );
        });
    });

    // CANCEL FOOD REQUEST
    const cancelRequestHandler = (req, res) => {
        const requestId = req.params.id;

        const checkQuery = "SELECT Status FROM food_request WHERE RequestID = ?";
        db.query(checkQuery, [requestId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Request not found." });
            }

            if (results[0].Status !== "PENDING") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel request in '${results[0].Status}' status. Only PENDING requests can be cancelled.`
                });
            }

            const cancelQuery = "UPDATE food_request SET Status = 'CANCELLED' WHERE RequestID = ?";
            db.query(cancelQuery, [requestId], (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: "Failed to cancel food request.",
                        error: err.message
                    });
                }

                res.json({
                    success: true,
                    message: "Food request has been cancelled.",
                    requestId: Number(requestId)
                });
            });
        });
    };

    router.put("/requests/:id/cancel", cancelRequestHandler);
    router.delete("/requests/:id", cancelRequestHandler);

    // NGO DASHBOARD METRICS
    router.get("/ngo/dashboard/:ngoId", (req, res) => {
        const ngoId = req.params.ngoId;

        const statsQuery = `
            SELECT
                COUNT(*) AS totalRequests,
                SUM(CASE WHEN Status = 'PENDING' THEN 1 ELSE 0 END) AS pendingRequests,
                SUM(CASE WHEN Status = 'ALLOCATED' THEN 1 ELSE 0 END) AS allocatedRequests,
                SUM(CASE WHEN Status = 'FULFILLED' THEN 1 ELSE 0 END) AS fulfilledRequests,
                SUM(CASE WHEN Status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelledRequests
            FROM food_request
            WHERE NGOID = ?
        `;

        db.query(statsQuery, [ngoId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Failed to load dashboard metrics.", error: err.message });
            }

            res.json({
                success: true,
                stats: results[0] || {
                    totalRequests: 0,
                    pendingRequests: 0,
                    allocatedRequests: 0,
                    fulfilledRequests: 0,
                    cancelledRequests: 0
                }
            });
        });
    });

    return router;
};