const express = require("express");

const router = express.Router();

module.exports = (db) => {

    // 1. CREATE ALLOCATION (Manual Match)
    router.post("/allocations", (req, res) => {
        const {
            donationId,
            requestId,
            allocatedQuantity
        } = req.body;

        if (!donationId || !requestId || !allocatedQuantity) {
            return res.status(400).json({
                success: false,
                message: "Please provide donationId, requestId, and allocatedQuantity."
            });
        }

        const qty = Number(allocatedQuantity);
        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({
                success: false,
                message: "Allocated quantity must be a positive number."
            });
        }

        // Check donation
        const donationQuery = `
            SELECT DonationID, DonorID, FoodName, FoodType, Quantity, Unit, ExpiryAt, Status
            FROM food_donation
            WHERE DonationID = ?
        `;

        db.query(donationQuery, [donationId], (err, donationResults) => {
            if (err) {
                console.error("Donation lookup error:", err);
                return res.status(500).json({ success: false, message: "Database error checking donation.", error: err.message });
            }

            if (donationResults.length === 0) {
                return res.status(404).json({ success: false, message: "Donation not found." });
            }

            const donation = donationResults[0];

            if (donation.Status !== "AVAILABLE") {
                return res.status(400).json({
                    success: false,
                    message: `Donation #${donationId} is in '${donation.Status}' status and not available for allocation.`
                });
            }

            if (new Date(donation.ExpiryAt) <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "This food donation has already expired."
                });
            }

            if (qty > Number(donation.Quantity)) {
                return res.status(400).json({
                    success: false,
                    message: `Allocated quantity (${qty} ${donation.Unit}) exceeds available donation quantity (${donation.Quantity} ${donation.Unit}).`
                });
            }

            // Check request
            const requestQuery = `
                SELECT RequestID, NGOID, FoodName, FoodType, QuantityRequired, Unit, RequiredBy, Priority, Status
                FROM food_request
                WHERE RequestID = ?
            `;

            db.query(requestQuery, [requestId], (err, requestResults) => {
                if (err) {
                    console.error("Request lookup error:", err);
                    return res.status(500).json({ success: false, message: "Database error checking request.", error: err.message });
                }

                if (requestResults.length === 0) {
                    return res.status(404).json({ success: false, message: "Food request not found." });
                }

                const request = requestResults[0];

                if (request.Status !== "PENDING") {
                    return res.status(400).json({
                        success: false,
                        message: `Request #${requestId} is in '${request.Status}' status and not pending.`
                    });
                }

                // Insert into donation_allocation
                const insertAllocQuery = `
                    INSERT INTO donation_allocation (DonationID, RequestID, AllocatedQuantity, Status)
                    VALUES (?, ?, ?, 'ALLOCATED')
                `;

                db.query(insertAllocQuery, [donationId, requestId, qty], (err, allocResult) => {
                    if (err) {
                        console.error("Allocation insert error:", err);
                        return res.status(500).json({ success: false, message: "Failed to create allocation.", error: err.message });
                    }

                    const allocationId = allocResult.insertId;

                    // Update donation status
                    const updateDonationQuery = "UPDATE food_donation SET Status = 'ALLOCATED' WHERE DonationID = ?";
                    db.query(updateDonationQuery, [donationId], (err) => {
                        if (err) console.error("Error updating donation status:", err);
                    });

                    // Update request status
                    const updateRequestQuery = "UPDATE food_request SET Status = 'ALLOCATED' WHERE RequestID = ?";
                    db.query(updateRequestQuery, [requestId], (err) => {
                        if (err) console.error("Error updating request status:", err);
                    });

                    // Auto-create an UNASSIGNED pickup_delivery record so volunteers can claim it
                    const pickupLoc = donation.PickupLocation || "TBD";
                    const deliveryLoc = request.DeliveryLocation || "TBD";
                    const insertDeliveryQuery = `
                        INSERT INTO pickup_delivery (AllocationID, VolunteerID, PickupLocation, DeliveryLocation, Status)
                        VALUES (?, NULL, ?, ?, 'ASSIGNED')
                    `;
                    db.query(insertDeliveryQuery, [allocationId, pickupLoc, deliveryLoc], (dErr, dResult) => {
                        if (dErr) console.error("Warning: Could not auto-create pickup_delivery record:", dErr.message);
                        else console.log(`Auto-created unassigned pickup_delivery #${dResult.insertId} for allocation #${allocationId}`);
                    });

                    res.status(201).json({
                        success: true,
                        message: "Food allocation created successfully! A pickup request is now available for volunteers.",
                        allocationId,
                        donationId,
                        requestId,
                        allocatedQuantity: qty,
                        unit: donation.Unit
                    });
                });
            });
        });
    });

    // 2. GET ALL ALLOCATIONS
    router.get("/allocations", (req, res) => {
        const query = `
            SELECT
                da.AllocationID,
                da.DonationID,
                da.RequestID,
                da.AllocatedQuantity,
                da.AllocationDate,
                da.Status,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                fd.PickupLocation,
                fd.ExpiryAt,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                donor.Phone AS DonorPhone,
                fr.DeliveryLocation,
                fr.Priority,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                ngo.Phone AS NGOPhone
            FROM donation_allocation da
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            ORDER BY da.AllocationDate DESC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Error fetching allocations:", err);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch allocations.",
                    error: err.message
                });
            }

            res.json({
                success: true,
                count: results.length,
                allocations: results
            });
        });
    });

    // 3. GET ALLOCATION STATS
    router.get("/allocations/stats", (req, res) => {
        const statsQuery = `
            SELECT
                COUNT(*) AS totalAllocations,
                SUM(CASE WHEN Status = 'ALLOCATED' THEN 1 ELSE 0 END) AS pendingPickup,
                SUM(CASE WHEN Status = 'PICKED_UP' THEN 1 ELSE 0 END) AS inTransit,
                SUM(CASE WHEN Status IN ('DELIVERED', 'COMPLETED') THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN Status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
            FROM donation_allocation
        `;

        db.query(statsQuery, (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Failed to fetch allocation stats.", error: err.message });
            }

            res.json({
                success: true,
                stats: results[0] || {
                    totalAllocations: 0,
                    pendingPickup: 0,
                    inTransit: 0,
                    completed: 0,
                    cancelled: 0
                }
            });
        });
    });

    // 4. SMART MATCHING SUGGESTIONS
    router.get("/allocations/suggestions", (req, res) => {
        // Fetch all available donations and all pending requests
        const donationsQuery = `
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
                u.Name AS DonorName,
                u.OrganizationName AS DonorOrg
            FROM food_donation fd
            JOIN users u ON fd.DonorID = u.UserID
            WHERE fd.Status = 'AVAILABLE'
            AND fd.ExpiryAt > NOW()
            ORDER BY fd.ExpiryAt ASC
        `;

        const requestsQuery = `
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
                u.Name AS NGOName,
                u.OrganizationName AS NGOOrg
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

        db.query(donationsQuery, (err, donations) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Error fetching available donations.", error: err.message });
            }

            db.query(requestsQuery, (err2, requests) => {
                if (err2) {
                    return res.status(500).json({ success: false, message: "Error fetching pending requests.", error: err2.message });
                }

                const suggestions = [];

                donations.forEach(donation => {
                    requests.forEach(request => {
                        let score = 0;
                        const matchReasons = [];

                        // 1. Food Type Match
                        const donType = (donation.FoodType || "").toLowerCase().trim();
                        const reqType = (request.FoodType || "").toLowerCase().trim();
                        if (donType === reqType || reqType === "any" || reqType === "other" || donType === "other") {
                            score += 40;
                            matchReasons.push("Food category matched");
                        } else if (
                            (donType.includes("food") && reqType.includes("food")) ||
                            (donType.includes("veg") && reqType.includes("veg")) ||
                            (donType.includes("bread") && reqType.includes("bakery")) ||
                            (donType.includes("bakery") && reqType.includes("bread"))
                        ) {
                            score += 30;
                            matchReasons.push("Compatible food type");
                        }

                        // 2. Food Name Keyword Overlap
                        const donWords = (donation.FoodName || "").toLowerCase().split(/\s+/);
                        const reqWords = (request.FoodName || "").toLowerCase().split(/\s+/);
                        const commonWords = donWords.filter(w => w.length > 2 && reqWords.includes(w));
                        if (commonWords.length > 0) {
                            score += 25;
                            matchReasons.push(`Keyword match: "${commonWords.join(", ")}"`);
                        }

                        // 3. Quantity Compatibility
                        const donQty = Number(donation.Quantity);
                        const reqQty = Number(request.QuantityRequired);
                        const qtyRatio = Math.min(donQty, reqQty) / Math.max(donQty, reqQty);
                        if (qtyRatio >= 0.8) {
                            score += 20;
                            matchReasons.push("Exact / Near-exact quantity fit");
                        } else if (qtyRatio >= 0.4) {
                            score += 12;
                            matchReasons.push("Good quantity overlap");
                        } else {
                            score += 5;
                        }

                        // 4. Urgency / Priority Boost
                        if (request.Priority === "URGENT") {
                            score += 15;
                            matchReasons.push("Urgent priority requirement");
                        } else if (request.Priority === "HIGH") {
                            score += 10;
                            matchReasons.push("High priority requirement");
                        }

                        // Normalized score capped at 99
                        const finalScore = Math.min(Math.max(score, 35), 98);
                        const suggestedQuantity = Math.min(donQty, reqQty);

                        suggestions.push({
                            donation,
                            request,
                            matchScore: finalScore,
                            suggestedQuantity,
                            unit: donation.Unit || request.Unit,
                            reasons: matchReasons
                        });
                    });
                });

                // Sort by match score descending
                suggestions.sort((a, b) => b.matchScore - a.matchScore);

                res.json({
                    success: true,
                    totalSuggestions: suggestions.length,
                    availableDonationsCount: donations.length,
                    pendingRequestsCount: requests.length,
                    suggestions: suggestions.slice(0, 30) // top 30 suggested pairs
                });
            });
        });
    });

    // 5. 1-CLICK AUTO-MATCH ENGINE
    router.post("/allocations/auto-match", (req, res) => {
        const donationsQuery = `
            SELECT DonationID, FoodName, FoodType, Quantity, Unit, ExpiryAt
            FROM food_donation
            WHERE Status = 'AVAILABLE' AND ExpiryAt > NOW()
            ORDER BY ExpiryAt ASC
        `;

        const requestsQuery = `
            SELECT RequestID, FoodName, FoodType, QuantityRequired, Unit, RequiredBy, Priority
            FROM food_request
            WHERE Status = 'PENDING' AND RequiredBy > NOW()
            ORDER BY 
                CASE Priority
                    WHEN 'URGENT' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    WHEN 'LOW' THEN 4
                    ELSE 5
                END,
                RequiredBy ASC
        `;

        db.query(donationsQuery, (err, availableDonations) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });

            db.query(requestsQuery, (err2, pendingRequests) => {
                if (err2) return res.status(500).json({ success: false, message: "DB Error", error: err2.message });

                if (availableDonations.length === 0 || pendingRequests.length === 0) {
                    return res.json({
                        success: true,
                        matchedCount: 0,
                        message: "No available donations or pending requests to match at this time."
                    });
                }

                const allocatedPairs = [];
                const usedDonationIds = new Set();
                const usedRequestIds = new Set();

                for (const request of pendingRequests) {
                    if (usedRequestIds.has(request.RequestID)) continue;

                    for (const donation of availableDonations) {
                        if (usedDonationIds.has(donation.DonationID)) continue;

                        const donType = (donation.FoodType || "").toLowerCase();
                        const reqType = (request.FoodType || "").toLowerCase();

                        // Compatible criteria
                        const typeMatch = (donType === reqType || reqType === "any" || reqType === "other" || donType === "other");
                        const donName = (donation.FoodName || "").toLowerCase();
                        const reqName = (request.FoodName || "").toLowerCase();
                        const nameMatch = donName.includes(reqName) || reqName.includes(donName);

                        if (typeMatch || nameMatch) {
                            const allocQty = Math.min(Number(donation.Quantity), Number(request.QuantityRequired));
                            allocatedPairs.push({
                                donationId: donation.DonationID,
                                requestId: request.RequestID,
                                foodName: donation.FoodName,
                                quantity: allocQty
                            });

                            usedDonationIds.add(donation.DonationID);
                            usedRequestIds.add(request.RequestID);
                            break;
                        }
                    }
                }

                if (allocatedPairs.length === 0) {
                    return res.json({
                        success: true,
                        matchedCount: 0,
                        message: "No compatible match pairs found between current available food and pending requests."
                    });
                }

                // Insert each allocated pair
                let completed = 0;
                let errorOccurred = false;

                allocatedPairs.forEach(pair => {
                    const insertQuery = "INSERT INTO donation_allocation (DonationID, RequestID, AllocatedQuantity, Status) VALUES (?, ?, ?, 'ALLOCATED')";
                    db.query(insertQuery, [pair.donationId, pair.requestId, pair.quantity], (err, allocResult) => {
                        if (err) {
                            errorOccurred = true;
                            console.error("Error creating auto-allocation:", err);
                        } else {
                            const allocationId = allocResult.insertId;
                            db.query("UPDATE food_donation SET Status = 'ALLOCATED' WHERE DonationID = ?", [pair.donationId]);
                            db.query("UPDATE food_request SET Status = 'ALLOCATED' WHERE RequestID = ?", [pair.requestId]);

                            // Auto-create an UNASSIGNED pickup_delivery record for volunteers to claim
                            const pickupLoc = pair.pickupLocation || "TBD";
                            const deliveryLoc = pair.deliveryLocation || "TBD";
                            db.query(
                                "INSERT INTO pickup_delivery (AllocationID, VolunteerID, PickupLocation, DeliveryLocation, Status) VALUES (?, NULL, ?, ?, 'ASSIGNED')",
                                [allocationId, pickupLoc, deliveryLoc],
                                (dErr) => { if (dErr) console.error("Auto-match delivery record error:", dErr.message); }
                            );
                        }

                        completed++;
                        if (completed === allocatedPairs.length) {
                            res.json({
                                success: true,
                                matchedCount: allocatedPairs.length,
                                message: `Successfully auto-matched and allocated ${allocatedPairs.length} food items! Pickup requests are now available for volunteers.`,
                                matchedAllocations: allocatedPairs
                            });
                        }
                    });
                });
            });
        });
    });

    // 6. GET SINGLE ALLOCATION BY ID
    router.get("/allocations/:id", (req, res) => {
        const allocId = req.params.id;
        const query = `
            SELECT
                da.AllocationID,
                da.DonationID,
                da.RequestID,
                da.AllocatedQuantity,
                da.AllocationDate,
                da.Status,
                fd.FoodName,
                fd.FoodType,
                fd.Quantity AS TotalDonationQuantity,
                fd.Unit,
                fd.PreparedAt,
                fd.ExpiryAt,
                fd.PickupLocation,
                donor.Name AS DonorName,
                donor.Email AS DonorEmail,
                donor.Phone AS DonorPhone,
                donor.OrganizationName AS DonorOrg,
                fr.QuantityRequired,
                fr.RequiredBy,
                fr.Priority,
                fr.DeliveryLocation,
                ngo.Name AS NGOName,
                ngo.Email AS NGOEmail,
                ngo.Phone AS NGOPhone,
                ngo.OrganizationName AS NGOOrg
            FROM donation_allocation da
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            WHERE da.AllocationID = ?
        `;

        db.query(query, [allocId], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Allocation not found." });
            }

            res.json({
                success: true,
                allocation: results[0]
            });
        });
    });

    // 7. CANCEL ALLOCATION
    const cancelAllocationHandler = (req, res) => {
        const allocId = req.params.id;

        const checkQuery = "SELECT AllocationID, DonationID, RequestID, Status FROM donation_allocation WHERE AllocationID = ?";
        db.query(checkQuery, [allocId], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Allocation not found." });
            }

            const alloc = results[0];

            if (alloc.Status !== "ALLOCATED") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel allocation in '${alloc.Status}' status. Only ALLOCATED status can be cancelled.`
                });
            }

            const cancelQuery = "UPDATE donation_allocation SET Status = 'CANCELLED' WHERE AllocationID = ?";
            db.query(cancelQuery, [allocId], (err) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to cancel allocation.", error: err.message });

                // Revert donation and request statuses
                db.query("UPDATE food_donation SET Status = 'AVAILABLE' WHERE DonationID = ?", [alloc.DonationID]);
                db.query("UPDATE food_request SET Status = 'PENDING' WHERE RequestID = ?", [alloc.RequestID]);

                res.json({
                    success: true,
                    message: `Allocation #${allocId} cancelled successfully. Donation and request have been restored to available state.`
                });
            });
        });
    };

    router.put("/allocations/:id/cancel", cancelAllocationHandler);
    router.delete("/allocations/:id", cancelAllocationHandler);

    return router;
};