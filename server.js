require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cron = require("node-cron");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());


const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.query("SELECT 1", (err) => {
  if (err) { console.error("DB connection failed:", err); return; }
  console.log("✦ MySQL connected");
});
// Save a letter
app.post("/api/letters", (req, res) => {
  const { uid, to_name, email, body, open_date } = req.body;
  db.query(
    "INSERT INTO letters (uid, to_name, email, body, open_date) VALUES (?, ?, ?, ?, ?)",
    [uid, to_name, email, body, open_date],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Daily cron — runs every day at 8:00 AM
cron.schedule("0 8 * * *", () => {
  console.log("✦ Checking for letters to send...");
  const today = new Date().toISOString().split("T")[0];

  db.query(
    "SELECT * FROM letters WHERE open_date <= ? AND sent = FALSE",
    [today],
    (err, rows) => {
      if (err) { console.error(err); return; }
      rows.forEach((letter) => {
        axios.post("https://api.brevo.com/v3/smtp/email", {
          sender: { name: "FutureSelf", email: "dlavagaming@gmail.com" },
          to: [{ email: letter.email, name: letter.to_name }],
          subject: "📬 A letter from your past self is waiting",
          htmlContent: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #0c0c10; color: #f0e6c8; border-radius: 12px;">
              <h2 style="color: #e8a84c; font-style: italic;">Dear ${letter.to_name},</h2>
              <p style="color: #a0a0b0; font-size: 14px;">You wrote yourself a letter in the past. Here it is:</p>
              <hr style="border-color: #2a2a3a; margin: 24px 0;" />
              <p style="font-size: 16px; line-height: 1.8;">${letter.body}</p>
              <hr style="border-color: #2a2a3a; margin: 24px 0;" />
              <p style="color: #6b6b80; font-size: 13px;">Meant to be opened: ${letter.open_date}</p>
              <p style="color: #e8a84c; font-size: 13px; margin-top: 24px;">— FutureSelf App ✦</p>
            </div>
          `,
        }, {
       headers: { "api-key": process.env.BREVO_API_KEY }
        }).then(() => {
          db.query("UPDATE letters SET sent = TRUE WHERE id = ?", [letter.id]);
          console.log(`✦ Email sent to ${letter.email}`);
        }).catch((e) => console.error("Email failed:", e.message));
      });
    }
  );
});

app.listen(3001, () => console.log("✦ Server running on port 3001"));

