const router = require("express").Router();
const {
  scrapeHubbardData,
} = require("../controllers/scrapeHubbardDataAfterLogin");
const {
  scrapeHughesData,
} = require("../controllers/scrapeHughesDataAfterLogin");
const { scrapeReeceData } = require("../controllers/scrapeReeceDataAfterLogin");

router.get("/", (req, res) => console.log("API IS WORKING"));
router.post("/scrape-Hubbard-data", scrapeHubbardData);
router.post("/scrape-hughes-data", scrapeHughesData);
router.post("/scrape-reece-data", scrapeReeceData);

module.exports = router;
