// sendPasswordEmail.js
// Usage: create a .env file (example below), run: npm install nodemailer dotenv
// then: node sendPasswordEmail.js

import nodemailer from "nodemailer";
import crypto from "crypto";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

/**
 * Generate a random password.
 * @param {number} length - length of password
 * @param {object} options - { numbers: bool, symbols: bool, upper: bool, lower: bool }
 * @returns {string}
 */
function generatePassword(length = 12, options = { numbers: true, symbols: true, upper: true, lower: true }) {
    if (length < 4) throw new Error("Password length should be at least 4");

    const sets = [];
    if (options.lower) sets.push("abcdefghijklmnopqrstuvwxyz");
    if (options.upper) sets.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    if (options.numbers) sets.push("0123456789");
    if (options.symbols) sets.push("!@#$%^&*()-_=+[]{};:,.<>?");

    if (sets.length === 0) throw new Error("At least one character set must be enabled");

    // ensure at least one char from each enabled set for complexity
    const requiredChars = sets.map(set => set[Math.floor(crypto.randomInt(0, set.length))]);

    // remaining characters
    const allChars = sets.join("");
    const remainingLength = length - requiredChars.length;
    let resultChars = requiredChars.slice();

    for (let i = 0; i < remainingLength; i++) {
        resultChars.push(allChars[Math.floor(crypto.randomInt(0, allChars.length))]);
    }

    // shuffle securely
    for (let i = resultChars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [resultChars[i], resultChars[j]] = [resultChars[j], resultChars[i]];
    }

    return resultChars.join("");
}

/**
 * Send email with given subject and text using nodemailer SMTP transport.
 * SMTP credentials must be provided in environment variables (see README below).
 * @param {string} to - recipient email
 * @param {string} subject
 * @param {string} text
 */
async function sendEmail({ to, subject, text }) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        throw new Error("Missing SMTP configuration in environment variables.");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true" || false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS, // may be an API key or app password
        },
        // optional: set a reasonable timeout
        socketTimeout: 10_000,
    });

    // verify connection configuration (optional but helpful)
    await transporter.verify();

    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        // html: `<p>${text}</p>`, // you can also send HTML
    });

    return info;
}

// Example main flow
export async function resetPass(to) {
    try {
        // === Configuration ===
        const recipient = to; // or pass as env var
        const passwordLength = Number(process.env.PWD_LENGTH) || 12;

        const password = generatePassword(passwordLength, {
            numbers: true,
            symbols: false,
            upper: true,
            lower: true,
        });

        const subject = "Your new access password";
        const message = `Hello,

A new password has been generated for you:

Password: ${password}

Please store it securely. If this was unexpected, contact support.

Best, SigmaBot`;

        const info = await sendEmail({ to: recipient, subject, text: message });
        console.log("Email sent:", info.messageId || info.response);
        return await bcrypt.hash(password, 10);
    } catch (err) {
        console.error("Failed:", err);
        process.exit(1);
    }
}

export { generatePassword, sendEmail };
