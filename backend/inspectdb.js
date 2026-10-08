const db = require('./db');
const queries = [
    "DESCRIBE distribution",
    "DESCRIBE completed_distributions",
    "SELECT * FROM distribution LIMIT 3",
    "SELECT * FROM completed_distributions LIMIT 3",
    "SELECT COUNT(*) AS userCount, Role FROM users GROUP BY Role",
    "SELECT COUNT(*) AS totalDonations FROM food_donation",
    "SELECT COUNT(*) AS totalRequests FROM food_request",
    "SELECT COUNT(*) AS totalAllocations FROM donation_allocation",
    "SELECT COUNT(*) AS totalDeliveries FROM pickup_delivery"
];
async function run() {
    for (const q of queries) {
        await new Promise(resolve => {
            db.query(q, (err, r) => {
                console.log("\n=== " + q + " ===");
                if (err) console.log("ERROR:", err.message);
                else console.log(JSON.stringify(r, null, 2));
                resolve();
            });
        });
    }
    process.exit(0);
}
run();
