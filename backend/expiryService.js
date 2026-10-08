/**
 * Food Rescue & Donation Management System
 * Expiration & Waste Management Service
 * Automatically detects expired surplus food before allocation or delivery
 * and marks it as EXPIRED/Wasted to prevent spoiled food from reaching beneficiaries.
 */

function checkAndExpireFood(db, callback) {
    // Step 1: Mark unallocated AVAILABLE donations as EXPIRED if ExpiryAt < NOW()
    const queryAvailable = `
        UPDATE food_donation
        SET Status = 'EXPIRED'
        WHERE Status = 'AVAILABLE' AND ExpiryAt < NOW()
    `;

    db.query(queryAvailable, (err1, resAvailable) => {
        if (err1) {
            console.error("Error expiring available donations:", err1);
            if (callback) callback(err1);
            return;
        }

        const expiredAvailableCount = resAvailable.affectedRows || 0;

        // Step 2: Find ALLOCATED donations that expired before completion/delivery
        const findAllocatedQuery = `
            SELECT
                da.AllocationID,
                da.DonationID,
                da.RequestID,
                fd.FoodName,
                fd.ExpiryAt
            FROM donation_allocation da
            JOIN food_donation fd ON da.DonationID = fd.DonationID
            WHERE da.Status IN ('ALLOCATED', 'PICKED_UP')
              AND fd.ExpiryAt < NOW()
        `;

        db.query(findAllocatedQuery, (err2, expiredAllocations) => {
            if (err2) {
                console.error("Error finding expired allocated donations:", err2);
                if (callback) callback(err2);
                return;
            }

            if (!expiredAllocations || expiredAllocations.length === 0) {
                if (callback) {
                    callback(null, {
                        expiredAvailable: expiredAvailableCount,
                        expiredInTransit: 0,
                        totalWasted: expiredAvailableCount
                    });
                }
                return;
            }

            const allocIds = expiredAllocations.map(a => a.AllocationID);
            const donationIds = expiredAllocations.map(a => a.DonationID);
            const requestIds = expiredAllocations.map(a => a.RequestID);

            // Step 3: Mark the food_donation records as EXPIRED
            const expireDonationsQ = `
                UPDATE food_donation
                SET Status = 'EXPIRED'
                WHERE DonationID IN (?)
            `;

            db.query(expireDonationsQ, [donationIds], (err3) => {
                if (err3) console.warn("Could not update expired donation status:", err3);

                // Step 4: Cancel the allocations
                const cancelAllocQ = `
                    UPDATE donation_allocation
                    SET Status = 'CANCELLED'
                    WHERE AllocationID IN (?)
                `;

                db.query(cancelAllocQ, [allocIds], (err4) => {
                    if (err4) console.warn("Could not cancel expired allocations:", err4);

                    // Step 5: Cancel any active pickup_delivery records
                    const cancelDeliveryQ = `
                        UPDATE pickup_delivery
                        SET Status = 'CANCELLED', Remarks = CONCAT(COALESCE(Remarks, ''), ' [AUTO-CANCELLED: Food expired before delivery]')
                        WHERE AllocationID IN (?) AND Status NOT IN ('DELIVERED', 'CANCELLED')
                    `;

                    db.query(cancelDeliveryQ, [allocIds], (err5) => {
                        if (err5) console.warn("Could not cancel deliveries for expired food:", err5);

                        // Step 6: Restore NGO food_requests back to PENDING so they can receive fresh food
                        const restoreRequestQ = `
                            UPDATE food_request
                            SET Status = 'PENDING'
                            WHERE RequestID IN (?) AND Status != 'FULFILLED'
                        `;

                        db.query(restoreRequestQ, [requestIds], (err6) => {
                            if (err6) console.warn("Could not restore requests:", err6);

                            console.log(`[Food Expiration Check] Expired ${expiredAvailableCount} unallocated donations and ${expiredAllocations.length} in-transit/allocated donations.`);

                            if (callback) {
                                callback(null, {
                                    expiredAvailable: expiredAvailableCount,
                                    expiredInTransit: expiredAllocations.length,
                                    totalWasted: expiredAvailableCount + expiredAllocations.length,
                                    affectedAllocations: allocIds
                                });
                            }
                        });
                    });
                });
            });
        });
    });
}

module.exports = { checkAndExpireFood };
