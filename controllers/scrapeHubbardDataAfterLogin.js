const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { productRecordsSaveInDB } = require("../utlis/saveProductData");

// Function to log in to the website
async function login(email, password, page) {
  const loginUrl =
    process.env.HubbardLoginURL || "https://www.hubbardsupplyhouse.com/login";
  try {
    await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
    });
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    await page.click(
      'div[class="form-group  login-submit"] > button[type="submit"]'
    );
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    console.error("Error logging in: ", error);
    throw error;
  }
}

// Function to log out from the website
async function logout(page) {
  const logoutUrl =
    process.env.HubbardLogoutURL || "https://www.hubbardsupplyhouse.com/logout";
  try {
    await page.goto(logoutUrl, {
      waitUntil: "domcontentloaded",
    });
    console.log("Logout successful");
  } catch (error) {
    console.error("Error logging out: ", error);
  }
}

// Function to scrape search results scrapeHubbardDataAfterLogin
async function scrapeSearchResults(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let data = [];
    let hasNextPage = true;
    while (hasNextPage) {
      const content = await page.content();
      const $ = cheerio.load(content);

      const productNames = $("div.product-name > a");
      const manufacturerRefElements = $("div.list-attribute.manufacturer-ref");
      const brandImg = $("div.brand-label > a > img");
      const categories = $("div.list-attribute.product-category > a");
      const productCodes = $("div.product-sku");
      const prices = $("div.price-label.has-price");
      const images = $("div.imgthumbnail img");
      const imageUrls = $("div.tile > a");
      const productStockes = $("span.live-stock-message");

      const length = Math.min(
        productNames.length,
        manufacturerRefElements.length,
        categories.length,
        productCodes.length,
        images.length,
        prices.length,
        imageUrls.length,
        productStockes.length
      );

      for (let i = 0; i < length; i++) {
        // Inside the loop where you are scraping search results
        const fullProductName = $(productNames[i]).text().trim();
        let productName, productDetails;
        const productNameParts = fullProductName
          .split(",", 2)
          .map((part) => part.trim());
        if (productNameParts.length >= 2) {
          productName = productNameParts[(0, 1)];
          productDetails = productNameParts[1];
        } else {
          productName = fullProductName;
          productDetails = ""; // or assign some default value
        }

        const productmanufacturerRefID =
          $(manufacturerRefElements[i])
            .text()
            .trim()
            .split("Manufacturer Ref")[1]
            ?.trim() || "";
        const productBrand = $(brandImg[i]).attr("alt")?.trim() || "";
        const productCategory = $(categories[i]).text().trim();
        const productSku =
          $(productCodes[i]).text().trim().split(":")[1]?.trim() || "";
        const productPrice = $(prices[i]).text().trim();
        const productImageUrl = $(images[i]).attr("src");
        const productUrl = $(imageUrls[i]).attr("href");
        const outOfStock =
          $(productStockes[i]).find(".live-instock").css("display") !== "none"
            ? false
            : true;
        const productSupplier = "Hubbard";
        const productType = productCategory
          .toLowerCase()
          .includes("accessories")
          ? "Accessories"
          : "Products";

        data.push({
          productName,
          productDetails,
          productSku,
          productBrand,
          productPrice,
          productImageUrl,
          productCategory,
          productSupplier,
          productUrl,
          productmanufacturerRefID,
          productType,
        });
      }

      const nextPageButton = await page.$("ul.pagination li.next-page a");
      hasNextPage = !!nextPageButton;

      if (hasNextPage) {
        await nextPageButton.click();
        await page.waitForNavigation({
          waitUntil: "domcontentloaded",
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    return data;
  } catch (error) {
    console.log("Error: ", error);
    return [];
  }
}

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Main function to scrape data and merge before saving to MongoDB
async function scrapeHubbardDataAfterLogin() {
  console.log("scrapeHubbardDataAfterLogin===========");
  const browserWSEndpoint =
    "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
  const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });

  // const browser = await getBrowser();
  const page = await getBrowser().then(async (browser) => browser.newPage());

  const email =
    process.env.HubbardEmail || "Plumbingaccounting@griffinbros.com";
  const password = process.env.HubbardPassword || "Zoomup22!";
  const baseUrl =
    process.env.HubbardBaseURL || "https://www.hubbardsupplyhouse.com/";
  const categoryPaths = [
    "residential-electric",
    "residential-gas",
    // "commercial-electric",
    // "commercial-gas",
    "tankless--3",
    "expansion-tanks--1",
    "tankless-heater-venting",
    "water-heater-parts-and-accessories",
  ];

  const categoryUrls = categoryPaths.map((path) => baseUrl + path);

  try {
    await login(email, password, page);
    console.log("login==============");
    let productDetails = [];
    for (const url of categoryUrls) {
      const searchResults = await scrapeSearchResults(page, url);
      if (searchResults) {
        productDetails.push(...searchResults);
      }
      await delay(5000);
    }
    // Save or update mergeData to MongoDB

    const scrapeLiveInventoryResult = await scrapeLiveInventory();

    const scrapeLiveInventoryResultDict = scrapeLiveInventoryResult.reduce(
      (acc, item) => {
        acc[item.sku] = item;
        return acc;
      },
      {}
    );

    // Iterate over productDetails and update the inventory information
    for (let i = 0; i < productDetails.length; i++) {
      const sku = productDetails[i]["productSku"];
      if (scrapeLiveInventoryResultDict[sku]) {
        productDetails[i]["inventory"] =
          scrapeLiveInventoryResultDict[sku]["inventory"];
        productDetails[i]["inventory_before_transform"] =
          scrapeLiveInventoryResultDict[sku]["inventory_before_transform"];
      }
    }

    console.log("productDetails===0========", productDetails[0]);
    console.log(
      "productDetails===last record========",
      productDetails[productDetails.length - 1]
    );

    console.log("productDetails===========", productDetails.length);

    return productDetails;
  } catch (error) {
    console.error("Error during scraping and merging:", error);
  } finally {
    await logout(page);
    await getBrowser().then(async (browser) => browser.close());
  }
}

async function scrapeLiveInventory() {
  const categoryPaths = [
    "/residential-electric",
    "/residential-gas",
    "/commercial-electric",
    "/commercial-gas",
    "/tankless--3",
    "/expansion-tanks--1",
    "/tankless-heater-venting",
    "/water-heater-parts-and-accessories",
  ];
  const baseUrl = "https://www.hubbardsupplyhouse.com";
  const browserWSEndpoint =
    "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
  const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });

  let allCapturedResponses = []; // Array to store all captured responses

  try {
    for (const categoryPath of categoryPaths) {
      console.log("categoryPath=============", categoryPath);
      const categoryUrl = baseUrl + categoryPath;
      const page = await getBrowser().then(async (browser) =>
        browser.newPage()
      );

      await page.setExtraHTTPHeaders({
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36",
        "upgrade-insecure-requests": "1",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,en;q=0.8",
      });

      await page.setRequestInterception(true);

      const capturedResponses = [];

      page.on("request", (request) => {
        if (
          request
            .url()
            .includes("https://www.hubbardsupplyhouse.com/ajax/live-inventory")
        ) {
          request.continue();
        } else {
          request.continue();
        }
      });

      page.on("response", async (response) => {
        if (
          response
            .url()
            .includes("https://www.hubbardsupplyhouse.com/ajax/live-inventory")
        ) {
          try {
            const text = await response.text();
            const responseData = JSON.parse(text);

            // Extract the data array from the response
            const data = responseData.data;

            if (Array.isArray(data)) {
              data.forEach((item) => {
                const inventoryBeforeTransform = item.inventory.map((i) => ({
                  branch: i.branch,
                  name: i.name,
                  stock: i.stock,
                }));
                capturedResponses.push({
                  sku: item.sku,
                  inventory: item.inventory,
                  inventory_before_transform: inventoryBeforeTransform,
                });
              });
            } else {
              console.error(
                "Unexpected response format - data array not found"
              );
            }
          } catch (error) {
            console.error("Error parsing JSON response:", error);
          }
        }
      });

      await page.goto(categoryUrl, { waitUntil: "networkidle2" });
      await delay(5000); // Wait for 5 seconds

      let hasNextPage = true;
      while (hasNextPage) {
        const nextPageButton = await page.$("ul.pagination li.next-page a");
        hasNextPage = !!nextPageButton;

        if (hasNextPage) {
          await nextPageButton.click();
          await page.waitForNavigation({
            waitUntil: "networkidle2",
          });
          await delay(5000); // Wait for 5 seconds before processing the next page
        }
      }

      // Close the page after scraping
      await getBrowser().then(async (browser) => browser.close());

      // Push captured responses of this category into the array
      allCapturedResponses.push(...capturedResponses);
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    // Close the browser after scraping all categories
    await getBrowser().then(async (browser) => browser.close());
    console.log(
      "allCapturedResponses==================",
      allCapturedResponses[0]
    );

    console.log(
      "allCapturedResponses==================",
      allCapturedResponses.length
    );
    return allCapturedResponses;
  }
}

const scrapeHubbardData = async (req, res) => {
  try {
    console.log("inside scrapeHubbardData");

    const scrapData = await scrapeHubbardDataAfterLogin();
    const saveData = await productRecordsSaveInDB("hubbard", scrapData);
    if (saveData) {
      res.status(200).json(saveData);
    } else {
      res.status(400).json({ message: "Data is not saved" });
    }
  } catch (error) {
    console.error("Error in /scrape-hughes-data route:", error);
    res.status(500).send("Error scraping data.");
  }
};

module.exports = { scrapeHubbardData, scrapeHubbardDataAfterLogin };
