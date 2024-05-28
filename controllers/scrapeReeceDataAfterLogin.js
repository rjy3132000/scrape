const { reeceProductData } = require("../model/productSchema");
const puppeteer = require("puppeteer");
const { productRecordsSaveInDB } = require("../utlis/saveProductData");

// Function to login
async function reeceLogin(username, password, page) {
  const loginUrl = "https://www.reece.com/login"; //process.env.ReecePageURL; // "https://www.reece.com/login" Replace with the actual login URL if needed ;
  try {
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector('input[name="email"]');
    await page.type('input[name="email"]', username);
    await page.type('input[name="password"]', password);
    // Wait for the login button to be visible with an increased timeout
    await page.waitForSelector(
      "button.login__card__sign-in__form__submit.default.primary",
      { visible: true, timeout: 60000 }
    );
    // Click the login button and wait for navigation to complete
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click("button.login__card__sign-in__form__submit.default.primary"),
    ]);
    console.log("Login successful");
  } catch (error) {
    console.error("Error logging in: ", error);
    throw error;
  }
}

// Function to get the product category from URL
function getProductCategoryFromUrl(url) {
  const urlParams = new URLSearchParams(new URL(url).search);
  const categories = urlParams.getAll("categories");
  return categories.length > 0 ? categories[categories.length - 1] : "unknown";
}

// Function to scrape a single page
async function scrapePage(page) {
  await page.waitForSelector(
    ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42",
    { visible: true }
  );
  // Extracting product details on the current page
  return await page.evaluate(() => {
    const products = document.querySelectorAll(
      ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42"
    );
    const results = [];
    products.forEach((product) => {
      const productName =
        product
          .querySelector(".MuiTypography-root.MuiTypography-body1.css-1a0u3kg")
          ?.textContent.trim() || null;
      const productStockStirng =
        product.querySelector(`span[class="pl-1"]`)?.textContent.trim() || 0;

      let productStock = 0;
      if (productStockStirng != 0) {
        productStock = +productStockStirng.split(" ")[0];
      }
      const priceElement = product.querySelector(
        'span[class="MuiTypography-root MuiTypography-h4 css-1m2ekip"]'
      );
      const price = priceElement?.textContent.trim() || null;
      const priceUnit = priceElement?.nextSibling?.textContent.trim() || null;
      const productPrice = price && priceUnit ? `${price} ${priceUnit}` : null;
      const productImageURL =
        product.querySelector("img.MuiBox-root.css-4w7ia0")?.src || null;
      const productBrand =
        product
          .querySelector(
            ".MuiTypography-root.MuiTypography-caption.MuiTypography-gutterBottom.css-kcq2dk"
          )
          ?.textContent.trim() || null;
      const productDetails =
        product
          .querySelector(".MuiTypography-root.MuiTypography-body1.css-1a0u3kg")
          ?.textContent.trim() || null;
      const productManufactureRefID =
        product
          .querySelector(".MuiTypography-root.MuiTypography-caption.css-hnsmw")
          ?.textContent.trim() || null;
      const productLink =
        product
          .querySelector(
            "a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineNone.css-116q2oc"
          )
          ?.getAttribute("href") || null;
      let productSku = null;
      if (productLink && productLink.includes("MSC-")) {
        const productSKUMatch = productLink.match(
          /\/product\/[^\/]+\/([^\/]+)/
        );
        if (productSKUMatch && productSKUMatch[1].startsWith("MSC-")) {
          productSku = productSKUMatch[1].substring(4); // Extract SKU after "MSC-"
        }
      }
      results.push({
        productName,
        productStock: productStock,
        productPrice,
        productImageURL,
        productBrand,
        productDetails,
        productManufactureRefID,
        productSku,
      });
    });
    return results;
  });
}

// Function to scrape search results
async function scrapeReeceCreateData(baseUrls, username, password) {
  const browserWSEndpoint =
    "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
  const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });

  // const browser = await getBrowser();
  const page = await getBrowser().then(async (browser) => browser.newPage());
  let allData = [];

  try {
    // Perform login
    await reeceLogin(username, password, page);
    // Wait for navigation to complete
    await page.waitForNavigation();

    for (const baseUrl of baseUrls) {
      console.log(`Navigating to URL: ${baseUrl}`);
      // Navigate to the search results page
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('div[data-testid="pagination"]');

      // Get the total number of pages
      const totalPages = await page.evaluate(() => {
        return parseInt(
          document
            .querySelector('span[data-testid="pagination-total"]')
            .textContent.trim(),
          10
        );
      });

      // Get the product category from URL
      const productCategory = getProductCategoryFromUrl(baseUrl);

      let data = [];
      for (let i = 1; i <= totalPages; i++) {
        console.log(`Scraping page ${i} of ${totalPages}`);
        try {
          await page.waitForNavigation({ waitUntil: "domcontentloaded" });
        } catch (error) {
          // console.error("Navigation timeout error:");
        }
        await page.waitForSelector(
          ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42",
          { visible: true }
        );
        const pageData = await scrapePage(page);

        // Add default values
        const enrichedPageData = pageData.map((item) => ({
          ...item,
          productCategory: productCategory,
          productSupplier: "Reece",
          productStatus: true,
        }));
        data = data.concat(enrichedPageData);

        // Check if there is a next page
        if (i < totalPages) {
          try {
            await Promise.all([
              page.click('button[data-testid="pagination-next"]'),
              page.waitForSelector(
                ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42",
                { visible: true }
              ),
            ]);
          } catch (error) {
            console.error(`Failed to navigate to page ${i + 1}:`, error);
          }
        }
      }
      allData = allData.concat(data);
    }

    return allData;
  } catch (error) {
    console.log("Error: ", error);
    return [];
  } finally {
    await getBrowser().then(async (browser) => browser.close());
  }
}

// Example usage
const scrapeReeceDataAfterLogin = async () => {
  const baseUrls = [
    "https://www.reece.com/search?&categories=Water%20Heaters&categories=Residential%20-%20Electric",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Residential%20-%20Gas",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Commercial%20-%20Electric",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Commercial%20-%20Tankless",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Residential%20-%20Tankless",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Commercial%20-%20Gas",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Connectors",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Earthquake%20Straps",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Expansion%20Tank",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Pan",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Parts",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Tankless%20Valves",
    // "https://www.reece.com/search?&categories=Water%20Heaters&categories=Water%20Heater%20Parts%20%26%20Accessories&categories=Other",
  ];
  const username = "austin@callnublue.com";
  const password = "BlueBuy1!";
  try {
    const searchResults = await scrapeReeceCreateData(
      baseUrls,
      username,
      password
    );
    //await WaterHeater.insertMany(searchResults);
    console.log("Data saved to MongoDB successfully.");
    console.log("searchResults=============", searchResults[0]);
    return searchResults;
  } catch (error) {
    console.error("Error scraping data: ", error);
    throw error;
  }
};

const scrapeReeceData = async (req, res) => {
  try {
    const scrapData = await scrapeReeceDataAfterLogin();
    console.log("data length------------", scrapData.length); //reece
    const saveData = await productRecordsSaveInDB("reece", scrapData);
    if (saveData) {
      res.status(200).json(saveData);
    } else {
      res.status(400).json({ message: "Data is not saved" });
    }
  } catch (error) {
    console.error("Error in /scrape-reece-data route:", error);
    res.status(500).send("Error scraping data.");
  }
};

module.exports = { scrapeReeceData, scrapeReeceDataAfterLogin };
