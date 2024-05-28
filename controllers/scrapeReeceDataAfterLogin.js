const puppeteer = require("puppeteer");
const { productRecordsSaveInDB } = require("../utlis/saveProductData");

// Function to login
async function reeceLogin(username, password, page) {
  const loginUrl = process.env.ReeceloginUrl || "https://www.reece.com/login";
  try {
    await page.goto(loginUrl);
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

// Function to scrape search results
async function scrapeReeceCreateData(baseUrl, username, password) {
  const browserWSEndpoint =
    "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
  const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });

  // const browser = await getBrowser();
  const page = await getBrowser().then(async (browser) => browser.newPage());
  try {
    // Perform login
    await reeceLogin(username, password, page);
    // Wait for navigation to complete
    await page.waitForNavigation();
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
    let data = [];
    for (let i = 1; i <= totalPages; i++) {
      console.log(`Scraping page ${i} of ${totalPages}`);
      try {
        await page.waitForNavigation({ waitUntil: "domcontentloaded" });
      } catch (error) {
        console.error("Navigation timeout error:");
      }
      await page.waitForSelector(
        ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42",
        { visible: true }
      );
      // Extracting product details on the current page
      const pageData = await page.evaluate(() => {
        const products = document.querySelectorAll(
          ".MuiGrid-root.MuiGrid-container.MuiGrid-spacing-xs-2.css-isbt42"
        );
        const results = [];
        products.forEach((product) => {
          const productName =
            product
              .querySelector(
                ".MuiTypography-root.MuiTypography-body1.css-1a0u3kg"
              )
              ?.textContent.trim() || null;
          const productStockStirng =
            product.querySelector(`span[class="pl-1"]`)?.textContent.trim() ||
            0;

          let productStock = 0;
          if (productStockStirng != 0) {
            productStock = +productStockStirng.split(" ")[0];
          }
          const priceElement = product.querySelector(
            'span[class="MuiTypography-root MuiTypography-h4 css-1m2ekip"]'
          );
          const price = priceElement?.textContent.trim() || null;
          const priceUnit =
            priceElement?.nextSibling?.textContent.trim() || null;
          const productPrice =
            price && priceUnit ? `${price} ${priceUnit}` : null;
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
              .querySelector(
                ".MuiTypography-root.MuiTypography-body1.css-1a0u3kg"
              )
              ?.textContent.trim() || null;
          const productManufactureRefID =
            product
              .querySelector(
                ".MuiTypography-root.MuiTypography-caption.css-hnsmw"
              )
              ?.textContent.trim() || null;
          const productLink =
            product
              .querySelector(
                "a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineNone.css-116q2oc"
              )
              ?.getAttribute("href") || null;
          let productSku = "";
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
            productStock,
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
      // Add default values
      const enrichedPageData = pageData.map((item) => ({
        ...item,
        productCategory: "water heater",
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
    return data;
  } catch (error) {
    console.log("Error: ", error);
    return [];
  } finally {
    await getBrowser().then(async (browser) => browser.close());
  }
}

// Example usage
const scrapeReeceDataAfterLogin = async () => {
  const baseUrl =
    process.env.ReeceBaseURL ||
    "https://www.reece.com/search?&categories=Water%20Heaters&categories=Commercial%20-%20Electric";
  const username = process.env.ReeceUserName || "austin@callnublue.com";
  const password = process.env.ReecePassword || "BlueBuy1!";
  try {
    const searchResults = await scrapeReeceCreateData(
      baseUrl,
      username,
      password
    );
    return searchResults;
  } catch (error) {
    console.error("Error scraping data: ", error);
    throw error;
  }
};

const scrapeReeceData = async (req, res) => {
  try {
    const scrapData = await scrapeReeceDataAfterLogin();
    const saveData = await productRecordsSaveInDB("reece", scrapData);
    if (saveData) {
      res.status(200).send(saveData);
    } else {
      res.status(400).send({ message: "Data is not saved" });
    }
  } catch (error) {
    console.error("Error in /scrape-hughes-data route:", error);
    res.status(500).send("Error scraping data.");
  }
};

module.exports = { scrapeReeceData, scrapeReeceDataAfterLogin };
