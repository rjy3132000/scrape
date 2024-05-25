const cron = require('node-cron');
const {productRecordsSaveInDB} = require("./saveProductData");
const {scrapeHughesDataAfterLogin} = require("../controllers/scrapeHughesDataAfterLogin");
const {scrapeReeceDataAfterLogin} = require("../controllers/scrapeReeceDataAfterLogin")
const {scrapeHubbardDataAfterLogin} = require("../controllers/scrapeHubbardDataAfterLogin")

function setupCronJob(scrapeFunction, schemaName, cronTime) {
  cron.schedule(cronTime, async () => {
    try {
      const scrapData = await scrapeFunction();
      await productRecordsSaveInDB(schemaName, scrapData);
      console.log(`Cron job for ${schemaName} scheduled to run at ${cronTime}.`);
    } catch (error) {
      console.error(`Error in cron job for ${schemaName}:`, error);
    }
  });
}

function setupCronJobs() {
  setupCronJob(scrapeHughesDataAfterLogin, 'hughes', '0 0 * * *');
  setupCronJob(scrapeReeceDataAfterLogin, 'reece', '0 1 * * *');
  setupCronJob(scrapeHubbardDataAfterLogin, 'hubbard', '0 2 * * *');
}

module.exports = { setupCronJobs };
