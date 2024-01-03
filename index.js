const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const locateChrome = require("locate-chrome");
require("dotenv").config();

const TOKEN = process.env.TOKEN;
const MAIN_CHANNEL = process.env.MAIN_CHANNEL;
const DEBUG_CHANNEL = process.env.DEBUG_CHANNEL;

const sendMessage = (text, chatId) => {
  const URL = `https://api.telegram.org/bot${TOKEN}/sendMessage?chat_id=${chatId}&text=${text}`;
  fetch(URL);
};

const extractTicketPart = url => {
  const regex = /\/([A-Z]{3}-[A-Z]{3})/;
  const match = url.match(regex);
  return match ? match[1] : "";
};

const getTransportationType = url => {
  if (url.includes("bus")) {
    return "🚌 Bus";
  } else if (url.includes("flights")) {
    return "✈️ Plane";
  } else if (url.includes("train")) {
    return "🚂 Train";
  } else {
    return "Transportation";
  }
};

const getDepartingDate = url => {
  const regex = /departing=(\d{4}-\d{2}-\d{2})/;
  const match = url.match(regex);
  return match ? match[1] : "Unknown";
};

const getSeatsCount = ($, url) => {
  const classSelector1 = ".text-grays-400.text-2.mt-2";
  const classSelector2 = url.includes("flights")
    ? ".text-2.mt-1.text-danger-400"
    : ".mt-2.text-2.text-danger-400";
  const elements1 = $(classSelector1);
  const elements2 = $(classSelector2);
  const elements = elements1.add(elements2);
  let count = 0;

  elements.each((index, element) => {
    const text = $(element).text().trim();
    const number = parseInt(text);
    if (!isNaN(number)) {
      count += number;
    }
  });

  return count;
};

const ticketFinder = async urls => {
  const executablePath = await locateChrome();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox"]
  });

  try {
    for (const url of urls) {
      const page = await browser.newPage();
      await page.goto(url);

      await page.waitForTimeout(5000);

      const html = await page.content();
      const $ = cheerio.load(html);
      let ticketText = "انتخاب بلیط";
      let ignoreText = "پرواز های تکمیل ظرفیت";
      if (url.includes("flights")) {
        ticketText = "انتخاب پرواز";
        ignoreText = "پرواز های تکمیل ظرفیت";
      }

      const disabledButtons = $('button.is-disabled:contains("انتخاب پرواز")');
      const disabledCount = disabledButtons.length;

      const ticketCount = html.split(ticketText).length - 1 - disabledCount;

      let availableCount = 0;
      if (ticketCount > 0) {
        const ticketsParent = $(
          "#app > div.wrapper > main > div > div > section"
        );
        const availableCards = ticketsParent
          .children()
          .nextAll(".available-card");
        availableCount = availableCards.length;

        // Ignore 'انتخاب پرواز' after 'پرواز های تکمیل ظرفیت'
        let ignore = false;
        availableCards.each((index, element) => {
          const cardText = $(element).text();
          const h3Element = $(element).find("h3");
          const h3Text = h3Element.text().trim();
          if (h3Text === ignoreText) {
            ignore = true;
          }
          if (!ignore) {
            availableCount++;
          }
        });
      }

      if (ticketCount > 0) {
        const ticketPart = extractTicketPart(url);
        const departingDate = getDepartingDate(url);
        const title = `${ticketPart} - ${departingDate}`;

        const availableSeatsCount = getSeatsCount($, url);

        sendMessage(
          `🚌 ${title}%0A%0A🔢 Available: ${ticketCount}%0A%0A🪑 Available Seats Count: ${availableSeatsCount}%0A%0A🔗 Link:%0A${url}`,
          MAIN_CHANNEL
        );
      } else if (ticketCount === 0) {
        const ticketPart = extractTicketPart(url);
        const departingDate = getDepartingDate(url);
        const title = `${ticketPart} | ${departingDate}`;

        sendMessage(`No Tickets Found for ${title}`, DEBUG_CHANNEL);
      }

      await page.close();
    }
  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
};

// Example usage with multiple URLs
const urls = [
  "https://www.alibaba.ir/bus/IFN-THR?departing=1402-10-16",
  "https://www.alibaba.ir/bus/IFN-THR?departing=1402-10-17"
];

setInterval(() => {
  ticketFinder(urls);
}, 10000);
