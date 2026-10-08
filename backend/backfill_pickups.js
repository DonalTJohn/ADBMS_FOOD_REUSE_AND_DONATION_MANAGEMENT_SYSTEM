// One-time backfill: create unassigned pickup_delivery records for allocations that don't have one
require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Life@#21',
    database: process.env.DB_NAME || 'food_rescue'
});

db.connect(err => {
    if (err) { console.error('DB Error:', err); process.exit(1); }

    const findQuery = `
        SELECT da.AllocationID, da.DonationID, da.RequestID, da.Status,
               COALESCE(fd.PickupLocation, 'TBD') AS PickupLocation,
               COALESCE(fr.DeliveryLocation, 'TBD') AS DeliveryLocation
        FROM donation_allocation da
        JOIN food_donation fd ON da.DonationID = fd.DonationID
        JOIN food_request fr ON da.RequestID = fr.RequestID
        WHERE da.Status = 'ALLOCATED'
          AND da.AllocationID NOT IN (
              SELECT DISTINCT AllocationID FROM pickup_delivery WHERE Status != 'CANCELLED'
          )
    `;

    db.query(findQuery, (err, rows) => {
        if (err) { console.error('Query error:', err); db.end(); return; }
        console.log(`Found ${rows.length} allocation(s) without a pickup_delivery record.`);

        if (rows.length === 0) { db.end(); return; }

        let pending = rows.length;
        rows.forEach(r => {
            db.query(
                "INSERT INTO pickup_delivery (AllocationID, VolunteerID, PickupLocation, DeliveryLocation, Status) VALUES (?, NULL, ?, ?, 'ASSIGNED')",
                [r.AllocationID, r.PickupLocation, r.DeliveryLocation],
                (e, result) => {
                    if (e) console.error(`Insert error for allocation #${r.AllocationID}:`, e.message);
                    else console.log(`✅ Created pickup_delivery #${result.insertId} for allocation #${r.AllocationID}`);
                    if (--pending === 0) {
                        console.log('Backfill complete!');
                        db.end();
                    }
                }
            );
        });
    });
});
