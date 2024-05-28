const puppeteer = require("puppeteer");
const { productRecordsSaveInDB } = require("../utlis/saveProductData");

async function hughesLogin(username, password, page) {
  const loginUrl =
    process.env.HugheshPageURL || "https://hughesstatesville.com/login";

  try {
    await page.goto(loginUrl);
    await page.waitForSelector('input[name="D1"]');
    console.log("wait URL");
    await page.type('input[name="D1"]', username);
    await page.type('input[name="D2"]', password);
    await page.click('button[type="submit"]');
    console.log("submit");

    await page.waitForNavigation();
    console.log("Login successful");
  } catch (error) {
    console.error("Error logging in: ", error);
    throw error;
  }
}

function hughesGetFirstIndex(inputString) {
  let arr = inputString.split(" "); // Split the input string by space
  let firstIndex = arr[0]; // Get the first index
  return firstIndex; // Return the first index
}

async function scrapeHughesDataAfterLogin() {
  const searchInputData = [
    "Wire nuts",
    "Expansion tanks",
    "Brass Tees",
    "Female adaptors",
    "Male adaptors",
    "Strapping iron",
    "Water heater stand",
    "Water heater pan",
    "water heaters",
  ];

  const browserWSEndpoint =
    "https://production-sfo.browserless.io?token=QBR4WvysA0iieKb0bc944a3bbc9fb8ab41b012ec8a";
  const getBrowser = async () => puppeteer.connect({ browserWSEndpoint });

  // const browser = await getBrowser();
  const page = await getBrowser().then(async (browser) => browser.newPage());

  const username = process.env.HugheshUserName || "mlcole@griffinbros.com";
  const password = process.env.HughesPassword || "Picc1701!";

  try {
    await hughesLogin(username, password, page);

    const searchURL = `https://hughesstatesville.com/eclipse.ecl?PROCID=H2.DISP.MAIN&HOME=1`;
    await page.goto(searchURL);

    await page.waitForSelector(`.form-inline.quick-search-form`);
    let data = [];

    for (const term of searchInputData) {
      await page.type(
        '.form-inline.quick-search-form input[name="SEARCH"]',
        term
      );
      await page.click(
        '.form-inline.quick-search-form button[aria-label="Search"]'
      );

      await Promise.all([
        page.waitForNavigation(),
        page.waitForSelector(".product-list-title"),
      ]);

      await page.evaluate(() => {
        document.querySelector(
          '.form-inline.quick-search-form input[name="SEARCH"]'
        ).value = "";
      });

      const noOfPagesText = await page.$eval(".page-items", (element) =>
        element.textContent.trim()
      );
      const noOfPages = parseInt(noOfPagesText.split("of ")[1], 10) || 1;
      const totalPages = Math.ceil(noOfPages / 100);

      console.log("TOTAL PAGES: ", totalPages);

      for (let i = 1; i <= totalPages; i++) {
        if (i > 1) {
          const nextPageSelectorGoToPage = `.row.product-list-header-pages > div:last-child > nav > ul > li a[aria-label='Go to page ${i}']`;
          const nextPageSelectorNextPages = `.row.product-list-header-pages > div:last-child > nav > ul > li a[aria-label='Next Pages']`;

          let nextButton = await page.$(nextPageSelectorGoToPage);
          if (!nextButton) {
            nextButton = await page.$(nextPageSelectorNextPages);
          }

          if (!nextButton) {
            console.log("Next button not found, stopping pagination.");
            break;
          }

          await Promise.all([
            nextButton.click(),
            page.waitForNavigation(),
            page.waitForSelector(".product-list-title"),
          ]);
        }

        const titles = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-sm-12.product-list-title"),
            (element) => element.textContent.trim()
          )
        );

        const descriptions = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-xs-12.product-list-desc"),
            (element) => element.textContent.trim()
          )
        );

        const ourParts = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              ".col-xs-6.partnum-container > .pdetail-data"
            ),
            (element) => element.textContent.trim()
          )
        );

        const prices = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-md-12.product-list-price"),
            (element) => {
              const text = element.textContent.trim();
              const match = text.match(/\d+(\.\d+)?/g); // This will match both integers and decimal numbers
              return match ? match.join("") : ""; // Join all matched parts to form a single string
            }
          )
        );

        const stocks = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-md-12.product-list-brinstock"),
            (element) => {
              const text = element.textContent.trim();
              const match = text.match(/\d+/g);
              return match ? match.join("") : "";
            }
          )
        );

        const productImages = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".product-list-image-cont img"),
            (element) => element.getAttribute("src")
          )
        );

        const prodManufactureID = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-sm-12.product-list-title>a"),
            (element) => element.getAttribute("href")
          ).map((href) => {
            const parts = href.split("-");
            return parts.slice(-3).join("-"); // Get the last 3 elements
          })
        );

        const items = titles.map((title, index) => ({
          productName: title,
          productDetails: descriptions[index] || "",
          productSku: ourParts[index] || "",
          productBrand: hughesGetFirstIndex(title),
          productPrice: prices[index] || "",
          productStock: stocks[index] || false,
          productImageUri: productImages[index] || "",
          productCategory: term,
          productStatus: true,
          productSupplier: "hughes",
          productManufactureRefID: prodManufactureID[index] || "Not Available",
          productType: term === "water heaters" ? "Product" : "Accessories",
        }));

        data.push(...items);
        console.log(`Scraping data from page ${i}`);
      }

      console.log("Scraped the Search Data for: ", term);
    }

    return data;
  } catch (error) {
    console.error("Error scraping data: ", error);
  } finally {
    await getBrowser().then(async (browser) => browser.close());
  }
}

const scrapeHughesData = async (req, res) => {
  try {
    const scrapData = await scrapeHughesDataAfterLogin();
    const saveData = productRecordsSaveInDB("hughes", scrapData);
    if (saveData) {
      const result = await saveData;
      res.status(200).json(result);
    } else {
      res.status(400).json({ message: "Data is not saved" });
    }
  } catch (error) {
    console.error("Error in /scrape-hughes-data route:", error);
    res.status(500).send("Error scraping data.");
  }
};

module.exports = { scrapeHughesData, scrapeHughesDataAfterLogin };
