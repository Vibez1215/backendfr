/**
 * scraper.js
 * 19hz.info scraper -- extracted from the Anything API route so it can
 * run in a standalone Express server deployable anywhere.
 */

"use strict";

// -- Region map ----------------------------------------------------------------

const NINETEEN_HZ_REGIONS = {
  "san francisco": "BayArea",
  "bay area": "BayArea",
  oakland: "BayArea",
  berkeley: "BayArea",
  "san jose": "BayArea",
  "los angeles": "LosAngeles",
  brooklyn: "NewYork",
  "new york": "NewYork",
  nyc: "NewYork",
  chicago: "Chicago",
  seattle: "Seattle",
  portland: "Portland",
  denver: "Denver",
  miami: "Miami",
  detroit: "Detroit",
  houston: "Houston",
  dallas: "Dallas",
  austin: "Austin",
  atlanta: "Atlanta",
  minneapolis: "Minneapolis",
  boston: "Boston",
  philadelphia: "Philadelphia",
  phoenix: "Phoenix",
  "san diego": "SanDiego",
  "las vegas": "LasVegas",
};

const REGION_CITY_NAMES = {
  BayArea: "San Francisco",
  LosAngeles: "Los Angeles",
  NewYork: "New York",
  Chicago: "Chicago",
  Seattle: "Seattle",
  Portland: "Portland",
  Denver: "Denver",
  Miami: "Miami",
  Detroit: "Detroit",
  Houston: "Houston",
  Dallas: "Dallas",
  Austin: "Austin",
  Atlanta: "Atlanta",
  Minneapolis: "Minneapolis",
  Boston: "Boston",
  Philadelphia: "Philadelphia",
  Phoenix: "Phoenix",
  SanDiego: "San Diego",
  LasVegas: "Las Vegas",
};

const REGION_TIMEZONES = {
  BayArea: "America/Los_Angeles",
  LosAngeles: "America/Los_Angeles",
  NewYork: "America/New_York",
  Chicago: "America/Chicago",
  Seattle: "America/Los_Angeles",
  Portland: "America/Los_Angeles",
  Denver: "America/Denver",
  Miami: "America/New_York",
  Detroit: "America/New_York",
  Houston: "America/Chicago",
  Dallas: "America/Chicago",
  Austin: "America/Chicago",
  Atlanta: "America/New_York",
  Minneapolis: "America/Chicago",
  Boston: "America/New_York",
  Philadelphia: "America/New_York",
  Phoenix: "America/Phoenix",
  SanDiego: "America/Los_Angeles",
  LasVegas: "America/Los_Angeles",
};

// -- Helpers -------------------------------------------------------------------

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function stripHtml(str) {
  return (str || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTag(tag) {
  return tag
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^hip hop$/, "hip-hop");
}

function normalizeTags(genreStr) {
  return (genreStr || "")
    .split(",")
    .map(normalizeTag)
    .filter(Boolean);
}

function guessCategory(tagsOrGenre) {
  const tags = Array.isArray(tagsOrGenre)
    ? tagsOrGenre
    : normalizeTags(tagsOrGenre);

  if (
    tags.some((tag) =>
      ["hip-hop", "r&b", "soul", "rap", "disco", "funk"].includes(tag),
    )
  ) {
    return "Club Night";
  }

  if (tags.some((tag) => ["jazz", "classical", "opera"].includes(tag))) {
    return "Concert";
  }

  return "Raves";
}

function parseWebsiteTime(dateTimeStr) {
  const parenMatch = (dateTimeStr || "").match(/\(([^)]+)\)/);
  const timeText = parenMatch ? parenMatch[1].trim() : null;
  const firstTimeText = timeText ? timeText.split(/\s*-\s*/)[0] : "";
  const timeMatch = firstTimeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);

  if (!timeMatch) {
    return { hour: 21, minute: 0, timeText };
  }

  let hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const meridiem = timeMatch[3].toLowerCase();

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return { hour, minute, timeText };
}

function buildLocalDateTime(yyyy, mm, dd, hour, minute) {
  return `${yyyy}-${mm}-${dd}T${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}:00`;
}

function extractTableCells(rowHtml) {
  return (rowHtml || "")
    .split(/<td\b[^>]*>/i)
    .slice(1)
    .map((part) => {
      const nextCellIdx = part.search(/<td\b/i);
      const endRowIdx = part.search(/<\/tr>/i);
      const endIdx =
        nextCellIdx === -1
          ? endRowIdx === -1
            ? part.length
            : endRowIdx
          : nextCellIdx;
      return stripHtml(part.slice(0, endIdx));
    });
}

function parseDatePartsFromStamp(dateStampStr) {
  const stampMatch = (dateStampStr || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!stampMatch) return null;
  const [, yyyy, mm, dd] = stampMatch;
  return { yyyy, mm, dd };
}

function parseDatePartsFromDateTime(dateTimeStr) {
  const ABBREV = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const abbrevMatch = (dateTimeStr || "").match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i,
  );

  if (!abbrevMatch) return null;

  return {
    yyyy: String(new Date().getFullYear()),
    mm: ABBREV[abbrevMatch[1].toLowerCase()],
    dd: abbrevMatch[2].padStart(2, "0"),
  };
}

// -- HTML parser ----------------------------------------------------------------
// 19hz row layout (7 cols):
//   [0]  date+time  "Fri: Apr 24 (9pm-2am)"
//   [1]  "Title @ Venue (City)"
//   [2]  tags       "house, tech house"
//   [3]  price/age  "$20 | 21+"
//   [4]  organiser
//   [5]  links
//   [6]  stamp      "2026/04/24"   <- most reliable date source

function parse19hzHtml(html, requestedCity, region) {
  const events = [];
  const defaultCity = REGION_CITY_NAMES[region] || region || "Unknown";
  const timezone = REGION_TIMEZONES[region] || null;
  const rowPattern = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  let rowsInspected = 0;
  let rowsSkipped = 0;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    if (/<th[\s>]/i.test(rowHtml)) continue;

    const cells = [];
    cells.push(...extractTableCells(rowHtml));

    rowsInspected++;
    if (cells.length < 3) {
      rowsSkipped++;
      continue;
    }

    const dateTimeStr = cells[0];
    const eventVenueStr = cells[1];
    const genreStr = cells[2] || "Electronic";
    const priceAgeStr = cells[3] || null;
    const dateStampStr = cells[cells.length - 1];
    const dateParts =
      parseDatePartsFromStamp(dateStampStr) ||
      parseDatePartsFromDateTime(dateTimeStr);

    if (!dateParts || !eventVenueStr || eventVenueStr.length < 3) {
      rowsSkipped++;
      continue;
    }

    const { hour, minute, timeText } = parseWebsiteTime(dateTimeStr);
    const eventDate = buildLocalDateTime(
      dateParts.yyyy,
      dateParts.mm,
      dateParts.dd,
      hour,
      minute,
    );

    let title = eventVenueStr;
    let venue = "TBA";
    const atIdx = eventVenueStr.indexOf(" @ ");
    if (atIdx !== -1) {
      title = eventVenueStr.slice(0, atIdx).trim();
      venue = eventVenueStr.slice(atIdx + 3).trim();
    }
    if (!title || title.length < 2) {
      rowsSkipped++;
      continue;
    }

    let city = defaultCity;
    const cityMatch = venue.match(/\(([^)]+)\)\s*$/);
    if (cityMatch) {
      city = cityMatch[1].trim();
      venue = venue.slice(0, venue.lastIndexOf("(")).trim();
    }

    let ticketUrl = null;
    const linkMatch = rowHtml.match(/href=["'](https?:\/\/[^"']+)["']/i);
    if (linkMatch) ticketUrl = linkMatch[1];

    const tags = normalizeTags(genreStr);

    events.push({
      id: `19hz_${simpleHash(title + eventDate)}`,
      title,
      venue,
      city,
      genre: genreStr,
      tags,
      category: guessCategory(tags),
      description: priceAgeStr || null,
      date: eventDate,
      timezone,
      time_text: timeText,
      ticket_url: ticketUrl,
      image_url: null,
      source: "19hz",
    });
  }

  console.log(
    `[19hz parser] inspected=${rowsInspected} skipped=${rowsSkipped} parsed=${events.length}`,
  );
  return events;
}

// -- Main scrape function -------------------------------------------------------

async function scrape19hz(city) {
  if (!city) return [];

  const cityLower = city.toLowerCase();
  const regionEntry = Object.entries(NINETEEN_HZ_REGIONS).find(([k]) =>
    cityLower.includes(k),
  );
  if (!regionEntry) {
    console.log(`[19hz scraper] no region match for city="${city}"`);
    return [];
  }

  const region = regionEntry[1];
  const url = `https://19hz.info/eventlisting_${region}.php`;
  console.log(`[19hz scraper] city="${city}" -> region="${region}" -> ${url}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    clearTimeout(timeout);
    console.log(
      `[19hz scraper] HTTP ${res.status} | content-type: ${res.headers.get(
        "content-type",
      )}`,
    );

    if (!res.ok) {
      console.error(`[19hz scraper] non-OK ${res.status} from ${url}`);
      return [];
    }

    const html = await res.text();
    console.log(`[19hz scraper] received ${html.length} bytes`);

    if (!html.includes("<tr") || !html.includes(" @ ")) {
      console.error(
        "[19hz scraper] HTML missing table or @ events -- possible block",
      );
      console.error("[19hz scraper] first 300 chars:", html.slice(0, 300));
      return [];
    }

    const allParsed = parse19hzHtml(html, city, region);

    const cityLc = city.toLowerCase();
    const regionCity = (REGION_CITY_NAMES[region] || "").toLowerCase();
    const filtered = allParsed.filter((e) => {
      const ec = (e.city || "").toLowerCase();
      return ec.includes(cityLc) || cityLc.includes(ec) || ec === regionCity;
    });

    console.log(
      `[19hz scraper] all=${allParsed.length} -> city-filtered="${city}" -> ${filtered.length}`,
    );
    filtered
      .slice(0, 3)
      .forEach((e, i) =>
        console.log(
          `[19hz scraper] sample[${i}]: "${e.title}" @ ${e.venue}, ${e.city} | ${e.date} ${e.timezone || ""}`,
        ),
      );

    return filtered;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[19hz scraper] timed out after 20s");
    } else {
      console.error("[19hz scraper] error:", err?.message);
    }
    return [];
  }
}

module.exports = {
  scrape19hz,
  _private: {
    buildLocalDateTime,
    extractTableCells,
    guessCategory,
    normalizeTags,
    parse19hzHtml,
    parseWebsiteTime,
  },
};

