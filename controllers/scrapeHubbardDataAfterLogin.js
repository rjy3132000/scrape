const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { productRecordsSaveInDB } = require("../utlis/saveProductData");
const browserWSEndpoint =
  "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
// Function to connect to an existing browser instance
const getBrowser = async () => {
  try {
    const browser = await puppeteer.connect({ browserWSEndpoint });
    return browser;
  } catch (error) {
    console.error("Error connecting to browser:", error);
    throw error;
  }
};

// Function to log in to the website
async function login(email, password, page) {
  const loginUrl =
    process.env.HubbardLoginURL || "https://www.hubbardsupplyhouse.com/login";
  try {
    console.log("Navigating to login page...");
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    // Check if already logged in by looking for a logout button
    const logoutButton = await page.$('a[href="/logout"]');
    if (logoutButton) {
      console.log("Already logged in.");
      return; // No need to log in again
    }
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    await page.evaluate(() => {
      const form = document.querySelector("form.auth-form.login-form");
      form.submit();
    });
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    console.log("Login successful");
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
      timeout: 60000,
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
    let data = [];
    let hasNextPage = true;
    while (hasNextPage) {
      console.log("in loop");
      // Wait for the product tiles to be visible
      await Promise.all([
        page.waitForSelector("div.product-name > a", {
          visible: true,
          timeout: 10000,
        }),
        page.waitForSelector("div.list-attribute.manufacturer-ref", {
          visible: true,
          timeout: 10000,
        }),
        page.waitForSelector("div.brand-label > a > img", {
          visible: true,
          timeout: 10000,
        }),
      ]);
      const result = await page.evaluate(() => {
        const data = [];
        $("div.tile").each(function () {
          console.log("in");
          const productName = $(this)
            .find("div.product-name > a")
            .text()
            .trim();
          let productDetails;
          const productNameParts = productName
            .split(",", 2)
            .map((part) => part.trim());
          if (productNameParts.length >= 2) {
            productDetails = productNameParts[1];
          } else {
            productDetails = ""; // or assign some default value
          }
          const productmanufacturerRefID =
            $(this)
              .find("div.list-attribute.manufacturer-ref")
              .text()
              .split("Manufacturer Ref")[1]
              ?.trim() || "";
          const productBrand =
            $(this).find("div.brand-label > a > img").attr("alt")?.trim() || "";
          const productCategory = $(this)
            .find("div.list-attribute.product-category > a")
            .text()
            .trim();
          const productSku =
            $(this)
              .find("div.product-sku")
              .text()
              .trim()
              .split(":")[1]
              ?.trim() || "";
          const productPrice = $(this)
            .find("div.price-label.has-price")
            .text()
            .trim();
          const productImageUrl = $(this)
            .find("div.imgthumbnail img")
            .attr("src");
          const productUrl = $(this).find("div.tile > a").attr("href");
          const outOfStock =
            $(this)
              .find("span.live-stock-message .live-instock")
              .css("display") !== "none";
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
            productSupplier: "Hubbard",
            productUrl,
            productmanufacturerRefID,
            productType,
            outOfStock,
          });
        });
        return data;
      });
      if (result.length === 0) {
        console.log("No data found on page:", page.url());
        break;
      }
      data.push(...result);
      const nextPageButton = await page.$("ul.pagination li.next-page a");
      if (!nextPageButton) {
        console.log("No next page button found");
        break;
      }
      await nextPageButton.click();
      await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    }
    return data;
  } catch (error) {
    console.error("Error scraping search results: ", error);
    return [];
  }
}
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Main function to scrape data and merge before saving to MongoDB
async function scrapeHubbardDataAfterLogin() {
  console.log("scrapeHubbardDataAfterLogin===========");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: process.env.CHROME_PATH || undefined,
    timeout: 90000, // Increase navigation timeout to 90 seconds
  });
  const page = await browser.newPage();
  const email =
    process.env.HubbardEmail || "Plumbingaccounting@griffinbros.com";
  const password = process.env.HubbardPassword || "Zoomup22!";
  const baseUrl =
    process.env.HubbardBaseURL || "https://www.hubbardsupplyhouse.com/";
  const categoryPaths = [
    "residential-electric",
    // "residential-gas",
    // "tankless--3",
    // "expansion-tanks--1",
    // "tankless-heater-venting",
    // "water-heater-parts-and-accessories",
  ];
  const categoryUrls = categoryPaths.map((path) => baseUrl + path);
  try {
    await login(email, password, page); // Only one login call here
    let productDetails = [];
    for (const url of categoryUrls) {
      const searchResults = await scrapeSearchResults(page, url);
      if (searchResults) {
        console.log("serachresult", searchResults);
        productDetails.push(...searchResults);
      }
      await delay(5000); // Wait before scraping next category
    }
    console.log("Scraped data:", productDetails);
    // Save or update mergeData to MongoDB
    const scrapeLiveInventoryResult = await scrapeLiveInventory(browser); // Pass browser object here
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
    // Connect to browserless.io and close the browser
    const browserWSEndpoint =
      "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
    const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });
    await getBrowser().then(async (browser) => browser.close());
    return productDetails;
  } catch (error) {
    console.error("Error during scraping and merging:", error);
  } finally {
    await logout(page);
    await browser.close();
  }
}

async function scrapeLiveInventory(browser) {
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
  let allCapturedResponses = []; // Array to store all captured responses
  // Custom delay function
  const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));
  try {
    for (const categoryPath of categoryPaths) {
      console.log("categoryPath=============", categoryPath);
      const categoryUrl = baseUrl + categoryPath;
      const page = await browser.newPage();
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
      await page.goto(categoryUrl, {
        waitUntil: "networkidle2", // Wait for the network to be idle
        timeout: 60000,
      });
      // Wait for a few seconds for the data to load
      await delay(5000); // Use custom delay function
      allCapturedResponses = allCapturedResponses.concat(capturedResponses); // Merge captured responses
      console.log("Captured responses for this category:", capturedResponses);
      // Close the page to free up resources
      await page.close();
    }
    console.log("All captured responses:", allCapturedResponses);
    return allCapturedResponses;
  } catch (error) {
    console.error("Error in scraping live inventory:", error);
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
