// import "server-only";

// export async function sendEmail(to: string, subject: string, text: string) {
//   const key = process.env.RESEND_API_KEY;
//   const from = process.env.EMAIL_FROM;
//   if (!key || !from) throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
//   const response = await fetch("https://api.resend.com/emails", {
//     method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
//     body: JSON.stringify({ from, to: [to], subject, text }),
//   });
//   if (!response.ok) throw new Error("Could not send the email. Check your email provider configuration.");
// }

// export async function sendSms(to: string, text: string) {
//   const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_PHONE_NUMBER;
//   if (!sid || !token || !from) throw new Error("SMS delivery is not configured. Set the Twilio environment variables.");
//   const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
//     method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({ From: from, To: to, Body: text }),
//   });
//   if (!response.ok) throw new Error("Could not send the SMS. Check your messaging provider configuration.");
// }


import "server-only";

export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  const senderName = process.env.EMAIL_FROM_NAME || "CodeQuest";

  if (!key || !from) {
    throw new Error(
      "Email delivery is not configured. Set BREVO_API_KEY and EMAIL_FROM."
    );
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: from,
      },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    console.error("Brevo API Error:", response.status, errorDetails);

    throw new Error("Could not send the email. Check Brevo configuration.");
  }
}

export async function sendSms(to: string, text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    token = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from)
    throw new Error("SMS delivery is not configured. Set the Twilio environment variables.");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: text }),
    }
  );

  if (!response.ok)
    throw new Error("Could not send the SMS. Check your messaging provider configuration.");
}
