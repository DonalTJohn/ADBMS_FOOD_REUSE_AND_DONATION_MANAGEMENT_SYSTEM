const db = require('./db');

async function check() {
    const q1 = "SHOW COLUMNS FROM food_donation LIKE 'Status'";
    const q2 = "SHOW COLUMNS FROM donation_allocation LIKE 'Status'";
    const q3 = "SHOW COLUMNS FROM pickup_delivery LIKE 'Status'";
    const q4 = "SELECT DonationID, FoodName, Status, ExpiryAt, NOW() as current_time, (ExpiryAt < NOW()) as is_past FROM food_donation";

    for (const q of [q1, q2, q3, q4]) {
        await new Promise(resolve => {
            db.query(q, (err, rows) => {
                console.log("\n--- " + q + " ---");
                if (err) console.error(err.message);
                else console.log(JSON.stringify(rows, null, 2));
                resolve();
            });
        });
    }
    process.exit(0);
}
check();
