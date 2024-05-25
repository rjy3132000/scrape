const fs = require("fs"); // Add this line at the top with other imports
const puppeteer = require("puppeteer");

async function login(username, password, page) {
  const loginUrl = "https://hughesstatesville.com/login"; // Replace with the actual login URL

  try {
    await page.goto(loginUrl);
    await page.waitForSelector('input[name="D1"]');
    await page.type('input[name="D1"]', username);
    await page.type('input[name="D2"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation(); // Wait for navigation to complete after clicking login button
    console.log("Login successful");
  } catch (error) {
    console.error("Error logging in: ", error);
    throw error;
  }
}

async function waitForUrl(page, url) {
  return page.waitForNavigation({
    waitUntil: "domcontentloaded",
    timeout: 0, // Optionally, set timeout to 0 for no timeout
    url: (targetUrl) => targetUrl.includes(url),
  });
}

async function scrapeDataAfterLogin() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const username = "mlcole@griffinbros.com";
  const password = "Picc1701!";

  try {
    await login(username, password, page);

    const url =
      "https://hughesstatesville.com/eclipse.ecl?PROCID=H2.DISP.MAIN&PAR=BATHTSF";
    await page.goto(url);

    // Wait for the page to load completely
    await page.waitForSelector(".page-items"); // Changed selector

    // Get the number of pages
    const noOfPages = await page.$eval(
      ".page-items", // Changed selector
      (element) => {
        const text = element.textContent.trim();
        return text.slice(-4); // Extract last 4 characters
      }
    );

    const totalPages = Math.ceil(noOfPages.trim() / 100);
    let data = [];

    for (let i = 1; i <= totalPages; i++) {
      const link = `https://hughesstatesville.com/eclipse.ecl?PROCID=H2.DISP.MAIN&&CLEV=4&MSOURCE=PAR&PLEV=${i}&QLEV=1&DROPDOWN=PRODUCT&&PAR=BATHTSF&KL=1`;

      try {
        await page.goto(link);

        // Wait for the page to load completely using the waitForUrl function
        await waitForUrl(page, `PLEV=${i}`);

        await page.waitForSelector(".col-sm-12.product-list-title");

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

        console.log(ourParts);

        const vendors = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(".col-xs-6.pdetail-list"),
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

        // Construct objects for each scraped item
        const items = titles.map((title, index) => ({
          title,
          description: descriptions[index] || "",
          ourPart: ourParts[index] || "",
          vendor: vendors[index] || "",
          price: prices[index] || "",
          stock: stocks[index] || "Not In Stock", // This should be corrected if it's actually product stock, not price
          productImage: productImages[index] || "",
        }));

        // Push items into the data array
        data.push(...items);

        console.log("Scraped page number: " + i);

        // Adding a delay of 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error("Error scraping page " + i + ": " + error);
      }
    }
    // console.log(data);

    // Write data to a JSON file
    const jsonData = JSON.stringify(data, null, 2); // Convert data array to JSON format with 2-space indentation
    fs.writeFileSync("scraped_data.json", jsonData); // Write JSON data to a file named 'scraped_data.json'
    console.log("Data saved to scraped_data.json successfully.");
  } catch (error) {
    console.error("Error scraping data: ", error);
  } finally {
    await browser.close();
  }
}

scrapeDataAfterLogin();
