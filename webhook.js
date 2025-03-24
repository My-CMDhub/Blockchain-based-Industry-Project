const express = require("express");
const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);
  res.status(200).send("Webhook received");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
