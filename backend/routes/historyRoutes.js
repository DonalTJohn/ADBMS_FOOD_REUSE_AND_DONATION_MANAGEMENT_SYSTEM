const express = require("express");
const router = express.Router();

module.exports = (db) => {

    /* ======================================================================
       1. FULL DISTRIBUTION HISTORY (with all joins)
       GET /api/history/distributions
    ====================================================================== */
    router.get("/history/distributions", (req, res) => {
        const query = `
            SELECT
                d.DistributionID,
                d.AllocationID,
                d.DistributionDate,
                d.QuantityDistributed,
                d.DistributionLocation,
                d.Status AS DistributionStatus,
                d.Remarks AS DistributionRemarks,
                da.AllocatedQuantity,
                da.AllocationDate,
                da.Status AS AllocationStatus,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                fd.PickupLocation,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                fr.Priority,
                fr.DeliveryLocation,
                pd.Status AS DeliveryStatus,
                volunteer.Name AS VolunteerName
            FROM distribution d
            JOIN donation_allocation da ON d.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            JOIN users ngo ON fr.NGOID = ngo.UserID
            LEFT JOIN pickup_delivery pd ON pd.AllocationID = da.AllocationID
            LEFT JOIN users volunteer ON pd.VolunteerID = volunteer.UserID
            ORDER BY d.DistributionDate DESC
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("History error:", err);
                return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            }
            res.json({ success: true, distributions: results, count: results.length });
        });
    });

    /* ======================================================================
       2. SYSTEM-WIDE STATS (for history & analytics)
       GET /api/history/stats
    ====================================================================== */
    router.get("/history/stats", (req, res) => {
        const queries = {
            totalDonations: "SELECT COUNT(*) AS val FROM food_donation",
            totalRequests: "SELECT COUNT(*) AS val FROM food_request",
            totalAllocations: "SELECT COUNT(*) AS val FROM donation_allocation",
            totalDeliveries: "SELECT COUNT(*) AS val FROM pickup_delivery",
            totalDistributions: "SELECT COUNT(*) AS val FROM distribution",
            totalUsers: "SELECT COUNT(*) AS val FROM users",
            completedDeliveries: "SELECT COUNT(*) AS val FROM pickup_delivery WHERE Status = 'DELIVERED'",
            totalFoodKg: "SELECT COALESCE(SUM(AllocatedQuantity), 0) AS val FROM donation_allocation WHERE Status IN ('DELIVERED','COMPLETED')",
            donationsByStatus: "SELECT Status, COUNT(*) AS cnt FROM food_donation GROUP BY Status",
            requestsByPriority: "SELECT Priority, COUNT(*) AS cnt FROM food_request GROUP BY Priority",
            deliveriesByMonth: `
                SELECT DATE_FORMAT(AllocationDate, '%b %Y') AS month,
                       COUNT(*) AS cnt
                FROM donation_allocation
                GROUP BY month
                ORDER BY MIN(AllocationDate) DESC
                LIMIT 6
            `
        };

        const results = {};
        const keys = Object.keys(queries);
        let remaining = keys.length;

        keys.forEach(key => {
            db.query(queries[key], (err, rows) => {
                if (err) {
                    results[key] = null;
                } else if (key === "donationsByStatus" || key === "requestsByPriority" || key === "deliveriesByMonth") {
                    results[key] = rows;
                } else {
                    results[key] = Number(rows[0]?.val) || 0;
                }

                remaining--;
                if (remaining === 0) {
                    res.json({ success: true, stats: results });
                }
            });
        });
    });

    /* ======================================================================
       3. NGO-SPECIFIC DISTRIBUTION HISTORY
       GET /api/history/distributions/ngo/:ngoId
    ====================================================================== */
    router.get("/history/distributions/ngo/:ngoId", (req, res) => {
        const ngoId = Number(req.params.ngoId);
        if (!ngoId) return res.status(400).json({ success: false, message: "Invalid NGO ID." });

        const query = `
            SELECT
                d.DistributionID,
                d.DistributionDate,
                d.QuantityDistributed,
                d.DistributionLocation,
                d.Status AS DistributionStatus,
                d.Remarks,
                fd.FoodName,
                fd.FoodType,
                fd.Unit,
                donor.Name AS DonorName,
                donor.OrganizationName AS DonorOrg,
                volunteer.Name AS VolunteerName,
                fr.Priority
            FROM distribution d
            JOIN donation_allocation da ON d.AllocationID = da.AllocationID
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            JOIN users donor ON fd.DonorID = donor.UserID
            JOIN food_request fr ON da.RequestID = fr.RequestID
            LEFT JOIN pickup_delivery pd ON pd.AllocationID = da.AllocationID
            LEFT JOIN users volunteer ON pd.VolunteerID = volunteer.UserID
            WHERE d.NGOID = ?
            ORDER BY d.DistributionDate DESC
        `;

        db.query(query, [ngoId], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            res.json({ success: true, distributions: results, count: results.length });
        });
    });

    /* ======================================================================
       4. DONOR HISTORY (their donated food lifecycle)
       GET /api/history/distributions/donor/:donorId
    ====================================================================== */
    router.get("/history/distributions/donor/:donorId", (req, res) => {
        const donorId = Number(req.params.donorId);
        if (!donorId) return res.status(400).json({ success: false, message: "Invalid Donor ID." });

        const query = `
            SELECT
                fd.DonationID,
                fd.FoodName,
                fd.FoodType,
                fd.Quantity,
                fd.Unit,
                fd.Status AS DonationStatus,
                fd.CreatedAt,
                fd.ExpiryAt,
                da.AllocatedQuantity,
                da.Status AS AllocationStatus,
                ngo.Name AS NGOName,
                ngo.OrganizationName AS NGOOrg,
                d.DistributionDate,
                d.DistributionLocation,
                d.Status AS DistributionStatus,
                volunteer.Name AS VolunteerName
            FROM food_donation fd
            LEFT JOIN donation_allocation da ON da.DonationID = fd.DonationID
            LEFT JOIN food_request fr ON da.RequestID = fr.RequestID
            LEFT JOIN users ngo ON fr.NGOID = ngo.UserID
            LEFT JOIN distribution d ON d.AllocationID = da.AllocationID
            LEFT JOIN pickup_delivery pd ON pd.AllocationID = da.AllocationID
            LEFT JOIN users volunteer ON pd.VolunteerID = volunteer.UserID
            WHERE fd.DonorID = ?
            ORDER BY fd.CreatedAt DESC
        `;

        db.query(query, [donorId], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error.", error: err.message });
            res.json({ success: true, donations: results, count: results.length });
        });
    });

    return router;
};
