const express = require("express");
const cors = require("cors");
const SftpClient = require("ssh2-sftp-client");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// --------- CONFIG FROM ENV (we'll set these later in Render) ---------
const SFTP_HOST = process.env.SFTP_HOST;
const SFTP_PORT = Number(process.env.SFTP_PORT || 22);
const SFTP_USERNAME = process.env.SFTP_USERNAME;
const SFTP_PASSWORD = process.env.SFTP_PASSWORD;
const SFTP_DIR = process.env.SFTP_DIR || "/Leads";
const DC_VENDOR_ID = process.env.DC_VENDOR_ID || "YOUR_DCID_HERE";

// Email settings (for sending you a copy of the app)
const EMAIL_HOST = process.env.EMAIL_HOST;      // e.g. smtp.gmail.com or your HostGator SMTP
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;          // where you want to receive the app
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// --------- SMALL HELPER: ESCAPE TEXT FOR XML ---------
function xmlEscape(value) {
  if (!value && value !== 0) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --------- BUILD ADF XML FROM FORM DATA ---------
function buildAdfXml(data) {
  const {
    firstName,
    lastName,
    phone,
    email,
    street,
    timeAtAddress,
    previousAddress,
    timeAtPreviousAddress,
    residenceType,
    rentAmount,
    dob,
    ssn,
    employer,
    workPhone,
    income,
    position,
    timeAtJob,
    previousEmployer,
    timeAtPreviousJob,
    downPayment,
    additionalIncomeSource,
    additionalIncomeAmount,
    vehicleInterest,
    driversLicense,
    notes
  } = data;

  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  const requestDate = new Date().toISOString();

  // Put all the extra fields into a clean comments block
  const commentLines = [];

  if (dob) commentLines.push(`Date of Birth: ${dob}`);
  if (ssn) commentLines.push(`SSN: ${ssn}`);
  if (timeAtAddress) commentLines.push(`Time at Address: ${timeAtAddress}`);
  if (previousAddress) commentLines.push(`Previous Address: ${previousAddress}`);
  if (timeAtPreviousAddress)
    commentLines.push(`Time at Previous Address: ${timeAtPreviousAddress}`);
  if (residenceType) commentLines.push(`Residence Type: ${residenceType}`);
  if (rentAmount) commentLines.push(`Rent/Mortgage Amount: ${rentAmount}`);

  if (employer) commentLines.push(`Employer: ${employer}`);
  if (workPhone) commentLines.push(`Work Phone: ${workPhone}`);
  if (income) commentLines.push(`Monthly Income Before Taxes: ${income}`);
  if (position) commentLines.push(`Position: ${position}`);
  if (timeAtJob) commentLines.push(`Time at Job: ${timeAtJob}`);
  if (previousEmployer)
    commentLines.push(`Previous Employer: ${previousEmployer}`);
  if (timeAtPreviousJob)
    commentLines.push(`Time at Previous Job: ${timeAtPreviousJob}`);

  if (additionalIncomeSource)
    commentLines.push(`Additional Income Source: ${additionalIncomeSource}`);
  if (additionalIncomeAmount)
    commentLines.push(`Additional Income Amount: ${additionalIncomeAmount}`);

  if (downPayment) commentLines.push(`Down Payment Amount: ${downPayment}`);
  if (driversLicense)
    commentLines.push(`Driver's License Number: ${driversLicense}`);

  if (vehicleInterest)
    commentLines.push(`Vehicle Interested In: ${vehicleInterest}`);

  if (notes) commentLines.push(`Additional Info: ${notes}`);

  const commentsText = commentLines.join(" | ");

  // Build the XML string
  return `<?xml version="1.0"?>
<?ADF VERSION="1.0"?>
<adf>
  <prospect>
    <requestdate>${xmlEscape(requestDate)}</requestdate>

    <vehicle interest="buy">
      <year></year>
      <make></make>
      <model>${xmlEscape(vehicleInterest || "")}</model>
    </vehicle>

    <customer>
      <contact>
        <name part="full">${xmlEscape(fullName)}</name>
        ${email ? `<email>${xmlEscape(email)}</email>` : ""}
        ${phone ? `<phone>${xmlEscape(phone)}</phone>` : ""}
        <address>
          <street>${xmlEscape(street || "")}</street>
          <city></city>
          <region></region>
          <postalcode></postalcode>
          <country>US</country>
        </address>
      </contact>
    </customer>

    <vendor>
      <contact>
        <name part="full">Car-Sign-Mint</name>
      </contact>
      <vendorid>${xmlEscape(DC_VENDOR_ID)}</vendorid>
    </vendor>

    <provider>
      <name part="full">Car-Sign-Mint Website (Wix Credit App)</name>
    </provider>

    ${commentsText ? `<comments>${xmlEscape(commentsText)}</comments>` : ""}
  </prospect>
</adf>`;
}

// --------- BUILD EMAIL BODY TEXT (FOR YOU) ---------
function buildEmailText(data) {
  const {
    firstName,
    lastName,
    phone,
    email,
    street,
    timeAtAddress,
    previousAddress,
    timeAtPreviousAddress,
    residenceType,
    rentAmount,
    dob,
    ssn,
    employer,
    workPhone,
    income,
    position,
    timeAtJob,
    previousEmployer,
    timeAtPreviousJob,
    downPayment,
    additionalIncomeSource,
    additionalIncomeAmount,
    vehicleInterest,
    driversLicense,
    notes
  } = data;

  return `
New Credit Application from your Wix Site

Name: ${firstName || ""} ${lastName || ""}
Phone: ${phone || ""}
Email: ${email || ""}

Address: ${street || ""}
Time at Address: ${timeAtAddress || ""}
Previous Address: ${previousAddress || ""}
Time at Previous Address: ${timeAtPreviousAddress || ""}
Residence Type: ${residenceType || ""}
Rent/Mortgage Amount: ${rentAmount || ""}

Date of Birth: ${dob || ""}
SSN: ${ssn || ""}

Employer: ${employer || ""}
Work Phone: ${workPhone || ""}
Monthly Income Before Taxes: ${income || ""}
Position: ${position || ""}
Time at Job: ${timeAtJob || ""}
Previous Employer: ${previousEmployer || ""}
Time at Previous Job: ${timeAtPreviousJob || ""}

Down Payment Amount: ${downPayment || ""}
Additional Income Source: ${additionalIncomeSource || ""}
Additional Income Amount: ${additionalIncomeAmount || ""}

Vehicle Interested In Purchasing: ${vehicleInterest || ""}
Driver's License Number: ${driversLicense || ""}

Any Additional Information:
${notes || ""}

(This lead was also sent to DealerCenter via ADF.)
`.trim();
}

// --------- OPTIONAL: HEALTH CHECK ---------
app.get("/", (req, res) => {
  res.send("DealerCenter ADF helper is running.");
});

// --------- MAIN ENDPOINT CALLED BY WIX ---------
app.post("/dealercenter-adf", async (req, res) => {
  const data = req.body || {};

  // Never log full data because it can contain SSN, etc.
  console.log(
    "Received credit app for:",
    (data.firstName || "") + " " + (data.lastName || "")
  );

  const sftp = new SftpClient();
  const xml = buildAdfXml(data);
  console.log("DEBUG XML OUTPUT:\n", xml);

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "_")
    .replace("Z", "");
  const randomPart = Math.floor(Math.random() * 1000);
  const filename = `CarSignMint_${timestamp}_${randomPart}.xml`;
  const remotePath = `${SFTP_DIR}/${filename}`;

  try {
    // ---- 1) SEND TO DEALERCENTER VIA SFTP ----
    await sftp.connect({
      host: SFTP_HOST,
      port: SFTP_PORT,
      username: SFTP_USERNAME,
      password: SFTP_PASSWORD
    });

    await sftp.put(Buffer.from(xml, "utf8"), remotePath);
    await sftp.end();

    console.log(`Uploaded ADF lead to ${remotePath}`);

    // ---- 2) EMAIL YOU A COPY (IF EMAIL SETTINGS EXIST) ----
    if (EMAIL_HOST && EMAIL_USER && EMAIL_PASS && EMAIL_TO) {
      try {
        const transporter = nodemailer.createTransport({
          host: EMAIL_HOST,
          port: EMAIL_PORT,
          secure: EMAIL_PORT === 465, // true for 465, false for others
          auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
          }
        });

        const fullName =
          (data.firstName || "") + " " + (data.lastName || "");
        const emailText = buildEmailText(data);

        await transporter.sendMail({
          from: EMAIL_FROM || EMAIL_USER,
          to: EMAIL_TO,
          subject: `New Credit Application - ${fullName || "Unknown"}`,
          text: emailText
        });

        console.log("Email copy of application sent to", EMAIL_TO);
      } catch (emailErr) {
        console.error("Failed to send email copy:", emailErr.message);
      }
    } else {
      console.log(
        "Email not configured (missing EMAIL_* env vars) - skipping email copy."
      );
    }

    res.json({ ok: true, file: remotePath });
  } catch (err) {
    console.error("SFTP upload failed:", err.message);
    try {
      await sftp.end();
    } catch (e) {
      // ignore
    }
    res.status(500).json({ ok: false, error: "SFTP upload failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DealerCenter ADF helper listening on port ${PORT}`);
});
