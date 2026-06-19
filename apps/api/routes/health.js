/**
 * Health Check
 */

const { Router } = require("express");
const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    version: "9.0.0",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
