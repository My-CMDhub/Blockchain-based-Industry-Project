const express = require("express");
const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const verifySignature = (req) => {
  const signature = req.headers['x-signature'];
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(JSON.stringify(req.body));
  const digest = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
};

app.post("/webhook", (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).send("Invalid signature");
    }

    if (!req.body || !req.body.event) {
      return res.status(400).send("Invalid payload");
    }

    console.log("Webhook received:", {
      event: req.body.event,
      data: req.body.data 
    });

    // Process different webhook events
    switch(req.body.event) {
      case 'transaction':
        // Handle transaction event
        break;
      case 'balance':
        // Handle balance event
        break;
      default:
        console.warn("Unknown webhook event:", req.body.event);
    }

    res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Internal server error");
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
