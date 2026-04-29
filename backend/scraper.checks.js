"use strict";

const assert = require("node:assert/strict");
const { _private } = require("./scraper");

function row(dateTime, eventVenue, tags, priceAge, stamp) {
  return `<tr>
    <td>${dateTime}</td>
    <td>${eventVenue}</td>
    <td>${tags}</td>
    <td>${priceAge || ""}</td>
    <td></td>
    <td><a href="https://example.com/tickets">Tickets</a></td>
    <td>${stamp}</td>
  </tr>`;
}

const html = `<table>
  <tr><th>Date/Time</th><th>Event Title @ Venue</th><th>Tags</th></tr>
  ${row(
    "Tue: Apr 28 (5pm)",
    "Charisma: Joey Trip, Bay B Sol @ 620 Jones (San Francisco)",
    "house, hip-hop, disco, funk",
    "free | 21+",
    "2026/04/28",
  )}
  ${row(
    "Tue: Apr 28 (9pm-2am)",
    "Interzone Darkwave Tuesdays @ F8 1192 Folsom (San Francisco)",
    "darkwave, EBM, goth, industrial",
    "free w/rsvp b4 10:30pm / $5 | 21+",
    "2026/04/28",
  )}
  ${row(
    "Tue: Apr 28 (9:30pm-2am)",
    "Fever Dream @ Make-Out Room (San Francisco)",
    "darkwave, synthpop, EBM, italo disco, minimal",
    "free | 21+",
    "2026/04/28",
  )}
  ${row(
    "Mon: Apr 27 (10pm)",
    "So House Your Evening So Far? @ The Valencia Room (San Francisco)",
    "house",
    "free | 21+",
    "2026/04/27",
  )}
  ${row(
    "Tue: Apr 28 (8pm)",
    "Floating Points Live @ War Memorial Opera House (San Francisco)",
    "classical, ambient",
    "$35 | 18+",
    "2026/04/28",
  )}
  <tr><td>Bad row</td><td>Missing stamp @ Venue</td><td>house</td><td></td></tr>
</table>`;

const events = _private.parse19hzHtml(html, "San Francisco", "BayArea");
assert.equal(events.length, 5);

assert.equal(events[0].date, "2026-04-28T17:00:00");
assert.equal(events[0].timezone, "America/Los_Angeles");
assert.equal(events[0].time_text, "5pm");
assert.deepEqual(events[0].tags, ["house", "hip-hop", "disco", "funk"]);
assert.equal(events[0].genre, "house, hip-hop, disco, funk");

assert.equal(events[1].date, "2026-04-28T21:00:00");
assert.equal(events[1].time_text, "9pm-2am");
assert.deepEqual(events[1].tags, ["darkwave", "ebm", "goth", "industrial"]);

assert.equal(events[2].date, "2026-04-28T21:30:00");
assert.equal(events[2].time_text, "9:30pm-2am");

assert.equal(events[3].date, "2026-04-27T22:00:00");
assert.deepEqual(events[3].tags, ["house"]);

assert.deepEqual(events[4].tags, ["classical", "ambient"]);
assert.equal(events[4].category, "Concert");

assert.deepEqual(_private.normalizeTags("hip hop, R&B, techno"), [
  "hip-hop",
  "r&b",
  "techno",
]);

console.log("All scraper checks passed.");
