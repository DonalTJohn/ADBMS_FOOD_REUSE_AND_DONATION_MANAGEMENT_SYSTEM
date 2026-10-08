const db = require('./db');

db.query("SHOW TABLES LIKE 'donation_allocation'", (err, r) => {
    if (err) { console.log("ERROR:", err.message); process.exit(1); }
    if (r.length === 0) {
        console.log("TABLE NOT FOUND — creating donation_allocation...");
        const createSQL = `
            CREATE TABLE IF NOT EXISTS donation_allocation (
                AllocationID INT AUTO_INCREMENT PRIMARY KEY,
                DonationID INT NOT NULL,
                RequestID INT NOT NULL,
                AllocatedQuantity DECIMAL(10,2) NOT NULL,
                Status ENUM('ALLOCATED','PICKED_UP','DELIVERED','COMPLETED','CANCELLED') DEFAULT 'ALLOCATED',
                AllocationDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                Notes TEXT,
                FOREIGN KEY (DonationID) REFERENCES food_donation(DonationID),
                FOREIGN KEY (RequestID) REFERENCES ngo_request(RequestID)
            )
        `;
        db.query(createSQL, (err2) => {
            if (err2) { console.log("CREATE ERROR:", err2.message); }
            else { console.log("donation_allocation table created successfully!"); }
            process.exit(0);
        });
    } else {
        console.log("donation_allocation table EXISTS:", JSON.stringify(r));
        process.exit(0);
    }
});
