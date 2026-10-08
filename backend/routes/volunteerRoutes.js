const express = require("express");
const router = express.Router();

module.exports = (db) => {

    /* ======================================================================
       1. GET VOLUNTEER DASHBOARD STATS
       GET /api/volunteer/stats/:volunteerId
    ====================================================================== */
    router.get("/volunteer/stats/:volunteerId", (req, res) => {
        const volunteerId = Number(req.params.volunteerId);
        if (!volunteerId) return res.status(400).json({ success: false, message: "Invalid volunteer ID." });

        const query = `
            SELECT
                COUNT(*) AS totalAssigned,
                SUM(CASE WHEN pd.Status = 'ASSIGNED' THEN 1 ELSE 0 END) AS pendingPickup,
                SUM(CASE WHEN pd.Status IN ('PICKED_UP','IN_TRANSIT') THEN 1 ELSE 0 END) AS inTransit,
                SUM(CASE WHEN pd.Status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN pd.Status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
            FROM pickup_delivery pd
            WHERE pd.VolunteerID = ?
        `;

        db.query(query, [volunteerId], (err, results) => {
            if (err) {
                console.error("Volunteer stats error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            const s = results[0] || {};
            res.json({
                success: true,
                stats: {
                    totalAssigned: Number(s.totalAssigned) || 0,
                    pendingPickup: Number(s.pendingPickup) || 0,
                    inTransit: Number(s.inTransit) || 0,
                    delivered: Number(s.delivered) || 0,
                    cancelled: Number(s.cancelled) || 0
                }
            });
        });
    });

    /* ======================================================================
       2. GET ALL DELIVERIES FOR A VOLUNTEER (with full join details)
       GET /api/volunteer/deliveries/:volunteerId
    ====================================================================== */
    router.get("/volunteer/deliveries/:volunteerId", (req, res) => {
        const volunteerId = Number(req.params.volunteerId);
        if (!volunteerId) return res.status(400).json({ success: false, message: "Invalid volunteer ID." });

        const query = `
            SELECT
                pd.PickupDeliveryID,
                pd.AllocationID,
                pd.VolunteerID,
                pd.PickupTime,
                pd.DeliveryTime,
                pd.PickupLocation,
                pd.DeliveryLocation,
                pd.Status AS DeliveryStatus,
                pd.Remarks,
                da.AllocatedQuantity,
                da.AllocationDate,
                da.Status AS AllocationStatus,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                fd.ExpiryAt,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                fr.Priority,
                fr.DeliveryLocation AS NGODeliveryLocation
            FROM pickup_delivery pd
            JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            WHERE pd.VolunteerID = ?
            ORDER BY FIELD(pd.Status, 'ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED'), pd.PickupTime ASC
        `;

        db.query(query, [volunteerId], (err, results) => {
            if (err) {
                console.error("Volunteer deliveries error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            res.json({ success: true, deliveries: results, count: results.length });
        });
    });

    /* ======================================================================
       3. CONFIRM PICKUP  (ASSIGNED → PICKED_UP / IN_TRANSIT)
       PUT /api/volunteer/deliveries/:id/pickup
    ====================================================================== */
    router.put("/volunteer/deliveries/:id/pickup", (req, res) => {
        const deliveryId = Number(req.params.id);
        const { volunteerId, remarks } = req.body;

        if (!deliveryId || !volunteerId) {
            return res.status(400).json({ success: false, message: "Delivery ID and Volunteer ID are required." });
        }

        // Verify this delivery belongs to this volunteer and is in ASSIGNED status
        const checkQuery = `
            SELECT pd.PickupDeliveryID, pd.Status, pd.AllocationID, pd.VolunteerID
            FROM pickup_delivery pd
            WHERE pd.PickupDeliveryID = ? AND pd.VolunteerID = ?
        `;

        db.query(checkQuery, [deliveryId, volunteerId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "Delivery not found or not assigned to you." });

            const delivery = rows[0];
            if (delivery.Status !== "ASSIGNED") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot confirm pickup: delivery is in '${delivery.Status}' status.`
                });
            }

            const now = new Date();
            const updateDelivery = `
                UPDATE pickup_delivery
                SET Status = 'PICKED_UP', PickupTime = ?, Remarks = COALESCE(?, Remarks)
                WHERE PickupDeliveryID = ?
            `;

            db.query(updateDelivery, [now, remarks || null, deliveryId], (err2) => {
                if (err2) return res.status(500).json({ success: false, message: "Failed to update delivery.", error: err2.message });

                // Also update allocation status
                db.query(
                    "UPDATE donation_allocation SET Status = 'PICKED_UP' WHERE AllocationID = ?",
                    [delivery.AllocationID],
                    (err3) => {
                        if (err3) console.warn("Allocation status update failed:", err3.message);
                        res.json({
                            success: true,
                            message: "Pickup confirmed! Delivery is now in transit.",
                            deliveryId,
                            pickupTime: now
                        });
                    }
                );
            });
        });
    });

    /* ======================================================================
       4. CONFIRM DELIVERY  (PICKED_UP / IN_TRANSIT → DELIVERED)
       PUT /api/volunteer/deliveries/:id/deliver
    ====================================================================== */
    router.put("/volunteer/deliveries/:id/deliver", (req, res) => {
        const deliveryId = Number(req.params.id);
        const { volunteerId, remarks } = req.body;

        if (!deliveryId || !volunteerId) {
            return res.status(400).json({ success: false, message: "Delivery ID and Volunteer ID are required." });
        }

        const checkQuery = `
            SELECT pd.PickupDeliveryID, pd.Status, pd.AllocationID, pd.VolunteerID,
                   da.DonationID, da.RequestID
            FROM pickup_delivery pd
            JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
            WHERE pd.PickupDeliveryID = ? AND pd.VolunteerID = ?
        `;

        db.query(checkQuery, [deliveryId, volunteerId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "Delivery not found or not assigned to you." });

            const delivery = rows[0];
            if (!["PICKED_UP", "IN_TRANSIT"].includes(delivery.Status)) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot confirm delivery: status is '${delivery.Status}'. Please confirm pickup first.`
                });
            }

            const now = new Date();

            db.query(
                "UPDATE pickup_delivery SET Status = 'DELIVERED', DeliveryTime = ?, Remarks = COALESCE(?, Remarks) WHERE PickupDeliveryID = ?",
                [now, remarks || null, deliveryId],
                (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: "Failed to update delivery.", error: err2.message });

                    // Update allocation → DELIVERED
                    db.query("UPDATE donation_allocation SET Status = 'DELIVERED' WHERE AllocationID = ?", [delivery.AllocationID], (err3) => {
                        if (err3) console.warn("Allocation update failed:", err3.message);

                        // Update food_donation → COMPLETED
                        db.query("UPDATE food_donation SET Status = 'COMPLETED' WHERE DonationID = ?", [delivery.DonationID], (err4) => {
                            if (err4) console.warn("Donation status update failed:", err4.message);

                            // Update food_request → FULFILLED
                            db.query("UPDATE food_request SET Status = 'FULFILLED' WHERE RequestID = ?", [delivery.RequestID], (err5) => {
                                if (err5) console.warn("Request status update failed:", err5.message);

                                res.json({
                                    success: true,
                                    message: "Delivery confirmed! Food has reached the NGO. Great work! 🎉",
                                    deliveryId,
                                    deliveryTime: now
                                });
                            });
                        });
                    });
                }
            );
        });
    });

    /* ======================================================================
       5. GET ADMIN VIEW — ALL DELIVERIES (all volunteers, including unassigned)
       GET /api/admin/deliveries
    ====================================================================== */
    router.get("/admin/deliveries", (req, res) => {
        const query = `
            SELECT
                pd.PickupDeliveryID,
                pd.AllocationID,
                pd.Status AS DeliveryStatus,
                pd.PickupTime,
                pd.DeliveryTime,
                pd.PickupLocation,
                pd.DeliveryLocation,
                pd.Remarks,
                pd.VolunteerID,
                volunteer.Name AS VolunteerName,
                volunteer.Phone AS VolunteerPhone,
                da.AllocatedQuantity,
                da.Status AS AllocationStatus,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                fr.Priority
            FROM pickup_delivery pd
            LEFT JOIN users volunteer ON pd.VolunteerID = volunteer.UserID
            JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            ORDER BY FIELD(pd.Status, 'ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED'), pd.PickupTime ASC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Admin deliveries error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            res.json({ success: true, deliveries: results, count: results.length });
        });
    });

    /* ======================================================================
       5a. GET AVAILABLE PICKUPS (unassigned deliveries — for volunteers to claim)
       GET /api/volunteer/available-pickups
    ====================================================================== */
    router.get("/volunteer/available-pickups", (req, res) => {
        const query = `
            SELECT
                pd.PickupDeliveryID,
                pd.AllocationID,
                pd.Status AS DeliveryStatus,
                pd.PickupLocation,
                pd.DeliveryLocation,
                pd.Remarks,
                da.AllocatedQuantity,
                da.AllocationDate,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                fd.ExpiryAt,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                fr.Priority,
                fr.DeliveryLocation AS NGODeliveryLocation
            FROM pickup_delivery pd
            JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            WHERE pd.VolunteerID IS NULL
              AND pd.Status = 'ASSIGNED'
              AND fd.ExpiryAt > NOW()
              AND fd.Status NOT IN ('EXPIRED', 'CANCELLED')
            ORDER BY fr.Priority = 'URGENT' DESC, fr.Priority = 'HIGH' DESC, fd.ExpiryAt ASC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Available pickups error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            res.json({ success: true, pickups: results, count: results.length });
        });
    });

    /* ======================================================================
       5b. VOLUNTEER CLAIMS / ACCEPTS A DELIVERY
       PUT /api/volunteer/claim-delivery/:id
    ====================================================================== */
    router.put("/volunteer/claim-delivery/:id", (req, res) => {
        const deliveryId = Number(req.params.id);
        const { volunteerId } = req.body;

        if (!deliveryId || !volunteerId) {
            return res.status(400).json({ success: false, message: "Delivery ID and Volunteer ID are required." });
        }

        // Verify delivery is still unassigned and food is not expired
        const checkQuery = `
            SELECT pd.PickupDeliveryID, pd.VolunteerID, pd.Status, fd.ExpiryAt, fd.Status AS FoodStatus
            FROM pickup_delivery pd
            JOIN donation_allocation da ON pd.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            WHERE pd.PickupDeliveryID = ?
        `;

        db.query(checkQuery, [deliveryId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "Delivery not found." });

            const row = rows[0];
            if (row.VolunteerID !== null) {
                return res.status(409).json({ success: false, message: "This pickup has already been claimed by another volunteer." });
            }
            if (row.Status !== "ASSIGNED") {
                return res.status(400).json({ success: false, message: `Cannot claim: delivery is in '${row.Status}' status.` });
            }
            if (new Date(row.ExpiryAt) <= new Date()) {
                return res.status(400).json({ success: false, message: "Cannot claim: the food has already expired." });
            }
            if (["EXPIRED", "CANCELLED"].includes(row.FoodStatus)) {
                return res.status(400).json({ success: false, message: "Cannot claim: the food donation is no longer available." });
            }

            // Verify the claimant is a volunteer
            db.query("SELECT UserID, Role FROM users WHERE UserID = ?", [volunteerId], (err2, volRows) => {
                if (err2) return res.status(500).json({ success: false, message: "Database error.", error: err2.message });
                if (volRows.length === 0) return res.status(404).json({ success: false, message: "User not found." });
                if (volRows[0].Role !== "VOLUNTEER") {
                    return res.status(403).json({ success: false, message: "Only volunteers can claim pickup requests." });
                }

                db.query(
                    "UPDATE pickup_delivery SET VolunteerID = ? WHERE PickupDeliveryID = ? AND VolunteerID IS NULL",
                    [volunteerId, deliveryId],
                    (err3, result) => {
                        if (err3) return res.status(500).json({ success: false, message: "Failed to claim delivery.", error: err3.message });
                        if (result.affectedRows === 0) {
                            return res.status(409).json({ success: false, message: "This pickup was just claimed by another volunteer. Please try a different one." });
                        }
                        res.json({
                            success: true,
                            message: "🚗 Pickup claimed successfully! It has been added to your deliveries.",
                            deliveryId,
                            volunteerId
                        });
                    }
                );
            });
        });
    });

    /* ======================================================================
       5c. ADMIN ASSIGNS A VOLUNTEER TO AN EXISTING DELIVERY
       PUT /api/admin/deliveries/:id/assign
    ====================================================================== */
    router.put("/admin/deliveries/:id/assign", (req, res) => {
        const deliveryId = Number(req.params.id);
        const { volunteerId } = req.body;

        if (!deliveryId || !volunteerId) {
            return res.status(400).json({ success: false, message: "Delivery ID and Volunteer ID are required." });
        }

        // Verify delivery exists and is still unassigned
        db.query("SELECT PickupDeliveryID, VolunteerID, Status FROM pickup_delivery WHERE PickupDeliveryID = ?", [deliveryId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "Delivery not found." });

            const pd = rows[0];
            if (pd.VolunteerID !== null) {
                return res.status(409).json({ success: false, message: `This delivery already has a volunteer assigned (ID: ${pd.VolunteerID}). Cancel and re-assign if needed.` });
            }

            // Verify the target is a VOLUNTEER role
            db.query("SELECT UserID, Role, Name FROM users WHERE UserID = ? AND Status = 'ACTIVE'", [volunteerId], (err2, volRows) => {
                if (err2) return res.status(500).json({ success: false, message: "Database error.", error: err2.message });
                if (volRows.length === 0) return res.status(404).json({ success: false, message: "Active volunteer not found." });
                if (volRows[0].Role !== "VOLUNTEER") {
                    return res.status(400).json({ success: false, message: "Selected user is not a volunteer." });
                }

                db.query(
                    "UPDATE pickup_delivery SET VolunteerID = ? WHERE PickupDeliveryID = ?",
                    [volunteerId, deliveryId],
                    (err3, result) => {
                        if (err3) return res.status(500).json({ success: false, message: "Failed to assign volunteer.", error: err3.message });
                        res.json({
                            success: true,
                            message: `Volunteer "${volRows[0].Name}" assigned to delivery #${deliveryId} successfully!`,
                            deliveryId,
                            volunteerId,
                            volunteerName: volRows[0].Name
                        });
                    }
                );
            });
        });
    });

    /* ======================================================================
       6. ASSIGN A VOLUNTEER TO AN ALLOCATION
       POST /api/volunteer/assign
    ====================================================================== */
    router.post("/volunteer/assign", (req, res) => {
        const { allocationId, volunteerId, remarks } = req.body;

        if (!allocationId || !volunteerId) {
            return res.status(400).json({ success: false, message: "allocationId and volunteerId are required." });
        }

        // Check allocation exists and is in ALLOCATED status
        db.query("SELECT * FROM donation_allocation WHERE AllocationID = ?", [allocationId], (err, allocRows) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            if (allocRows.length === 0) return res.status(404).json({ success: false, message: "Allocation not found." });

            const alloc = allocRows[0];
            if (!["ALLOCATED", "PICKED_UP"].includes(alloc.Status)) {
                return res.status(400).json({
                    success: false,
                    message: `Allocation is in '${alloc.Status}' status and cannot be assigned.`
                });
            }

            // Check volunteer exists and is a VOLUNTEER role
            db.query("SELECT UserID, Role FROM users WHERE UserID = ?", [volunteerId], (err2, volRows) => {
                if (err2) return res.status(500).json({ success: false, message: "Database error.", error: err2.message });
                if (volRows.length === 0) return res.status(404).json({ success: false, message: "Volunteer user not found." });
                if (volRows[0].Role !== "VOLUNTEER") {
                    return res.status(400).json({ success: false, message: "Selected user is not a volunteer." });
                }

                // Check if this allocation is already assigned
                db.query("SELECT PickupDeliveryID FROM pickup_delivery WHERE AllocationID = ? AND Status != 'CANCELLED'", [allocationId], (err3, existingRows) => {
                    if (err3) return res.status(500).json({ success: false, message: "Database error.", error: err3.message });
                    if (existingRows.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: `This allocation already has a delivery assigned (ID: ${existingRows[0].PickupDeliveryID}).`
                        });
                    }

                    // Get pickup and delivery locations from related records
                    const locationQuery = `
                        SELECT fd.PickupLocation, fr.DeliveryLocation
                        FROM donation_allocation da
                        JOIN food_donation fd ON da.DonationID = fd.DonationID
                        JOIN food_request fr ON da.RequestID = fr.RequestID
                        WHERE da.AllocationID = ?
                    `;

                    db.query(locationQuery, [allocationId], (err4, locRows) => {
                        if (err4) return res.status(500).json({ success: false, message: "Database error.", error: err4.message });

                        const pickupLoc = locRows[0]?.PickupLocation || "TBD";
                        const deliveryLoc = locRows[0]?.DeliveryLocation || "TBD";

                        const insertQuery = `
                            INSERT INTO pickup_delivery
                            (AllocationID, VolunteerID, PickupLocation, DeliveryLocation, Status, Remarks)
                            VALUES (?, ?, ?, ?, 'ASSIGNED', ?)
                        `;

                        db.query(insertQuery, [allocationId, volunteerId, pickupLoc, deliveryLoc, remarks || null], (err5, result) => {
                            if (err5) {
                                console.error("Assign volunteer error:", err5);
                                return res.status(500).json({ success: false, message: "Failed to assign volunteer.", error: err5.message });
                            }

                            res.status(201).json({
                                success: true,
                                message: "Volunteer assigned successfully!",
                                deliveryId: result.insertId,
                                allocationId,
                                volunteerId
                            });
                        });
                    });
                });
            });
        });
    });

    /* ======================================================================
       7. GET LIST OF ALL VOLUNTEERS (for admin assign dropdown)
       GET /api/volunteers
    ====================================================================== */
    router.get("/volunteers", (req, res) => {
        db.query(
            "SELECT UserID, Name, Phone, City FROM users WHERE Role = 'VOLUNTEER' AND Status = 'ACTIVE' ORDER BY Name ASC",
            (err, results) => {
                if (err) {
                    console.error("Volunteers list error:", err);
                    return res.status(500).json({ success: false, message: "Database error.", error: err.message });
                }
                res.json({ success: true, volunteers: results, count: results.length });
            }
        );
    });

    return router;
};
