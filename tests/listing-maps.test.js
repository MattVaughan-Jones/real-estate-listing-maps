// Locks in what the map beside each listing shows, and where maps are allowed to appear.
// The page fixtures copy the parts of each site's markup that the adapters rely on, as
// recorded from the live sites in November 2026.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadListingPage, waitForPageToSettle } = require("./load-extension-into-page");

const REALESTATE_SEARCH_URL = "https://www.realestate.com.au/buy/in-richmond,+vic+3121/list-1";
const DOMAIN_SEARCH_URL = "https://www.domain.com.au/sale/murarrie-qld-4172/";

function realestateResultsHtml(addresses) {
  const listingCards = addresses.map(
    (address) => `<li><article><a href="/property-house-vic-richmond-1">View</a><h2>${address}</h2></article></li>`
  );
  return `<ul class="tiered-results">${listingCards.join("")}</ul>`;
}

// An ordinary Domain listing. Its photos are a carousel too: a visible slide with no address.
function domainListingHtml(streetLine, suburbLine) {
  return `<li><div data-testid="listing-card-wrapper-standard">
    <div class="slick-slide" aria-hidden="false"><img alt="photo"></div>
    <span data-testid="address-line1">${streetLine}, </span>
    <span data-testid="address-line2">${suburbLine}</span>
  </div></li>`;
}

// Domain's "Featured properties" entry: several listings in one carousel, one slide showing.
function domainFeaturedCarouselHtml(streetLines, visibleSlideIndex) {
  const slides = streetLines.map(
    (streetLine, slideIndex) => `<div class="slick-slide" aria-hidden="${slideIndex !== visibleSlideIndex}">
      <div data-testid="listing-card-wrapper-premiumplus">
        <span data-testid="address-line1">${streetLine}, </span>
        <span data-testid="address-line2">Murarrie</span>
      </div></div>`
  );
  return `<li id="featured">${slides.join("")}</li>`;
}

const domainResultsHtml = (listItemsHtml) => `<ul data-testid="results">${listItemsHtml}</ul>`;

const listingMapIn = (listingCard) => listingCard.querySelector(".listing-map-embed");
const pinnedAddressOf = (listingCard) => new URL(listingMapIn(listingCard).src).searchParams.get("q");
const mapUrlOf = (listingCard) => new URL(listingMapIn(listingCard).src);

test("each realestate.com.au listing gets a map pinned on its own address", async () => {
  const page = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: realestateResultsHtml(["21 Baker Street, Richmond", "5 Lennox Street, Richmond"]),
  });
  await waitForPageToSettle();

  const [firstCard, secondCard] = page.document.querySelectorAll("article");
  assert.equal(pinnedAddressOf(firstCard), "21 Baker Street, Richmond");
  assert.equal(pinnedAddressOf(secondCard), "5 Lennox Street, Richmond");
});

test("new users' maps centre on the pin at zoom 15; a saved fixed centre is used instead", async () => {
  const defaultPage = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: realestateResultsHtml(["21 Baker Street, Richmond"]),
  });
  await waitForPageToSettle();
  const defaultMapUrl = mapUrlOf(defaultPage.document.querySelector("article"));
  assert.equal(defaultMapUrl.searchParams.get("z"), "15");
  assert.equal(defaultMapUrl.searchParams.has("ll"), false, "no fixed centre: Google centres on the pin");

  const fixedCentrePage = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: realestateResultsHtml(["21 Baker Street, Richmond"]),
    savedSettings: {
      framingMode: "fixed",
      followPinZoomLevel: 15,
      fixedCentre: { latitude: -27.4698, longitude: 153.0251 },
      fixedCentreZoomLevel: 12,
    },
  });
  await waitForPageToSettle();
  const fixedCentreMapUrl = mapUrlOf(fixedCentrePage.document.querySelector("article"));
  assert.equal(fixedCentreMapUrl.searchParams.get("ll"), "-27.4698,153.0251");
  assert.equal(fixedCentreMapUrl.searchParams.get("z"), "12");
  assert.equal(fixedCentreMapUrl.searchParams.get("q"), "21 Baker Street, Richmond");
});

test("when the site reuses a card for another listing, its map follows the new address", async () => {
  // Bug fixed: moving to page 2 reused cards but kept page 1's maps beside them.
  const page = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: realestateResultsHtml(["21 Baker Street, Richmond"]),
  });
  await waitForPageToSettle();

  const reusedCard = page.document.querySelector("article");
  reusedCard.querySelector("h2").textContent = "9 Docker Street, Richmond";
  await waitForPageToSettle();

  assert.equal(pinnedAddressOf(reusedCard), "9 Docker Street, Richmond");
  assert.equal(reusedCard.querySelectorAll(".listing-map-embed").length, 1);
});

test("a reused card whose address can't be read loses its map rather than showing a stale one", async () => {
  const page = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: realestateResultsHtml(["21 Baker Street, Richmond"]),
  });
  await waitForPageToSettle();

  const reusedCard = page.document.querySelector("article");
  reusedCard.querySelector("h2").remove();
  await waitForPageToSettle();

  assert.equal(listingMapIn(reusedCard), null);
});

test("an element that stops being a listing (e.g. becomes an ad) loses its map", async () => {
  const page = loadListingPage({
    pageUrl: DOMAIN_SEARCH_URL,
    pageHtml: domainResultsHtml(domainListingHtml("36 Winton Crescent", "Murarrie")),
  });
  await waitForPageToSettle();

  const formerListing = page.document.querySelector("li");
  assert.notEqual(listingMapIn(formerListing), null);
  formerListing.querySelector('[data-testid^="listing-card-wrapper"]').remove();
  await waitForPageToSettle();

  assert.equal(listingMapIn(formerListing), null);
});

test("a Domain listing with a photo carousel is still pinned on its address", async () => {
  // Bug fixed: the photo carousel's visible slide was mistaken for the listing, so no map.
  const page = loadListingPage({
    pageUrl: DOMAIN_SEARCH_URL,
    pageHtml: domainResultsHtml(domainListingHtml("36 Winton Crescent", "Murarrie")),
  });
  await waitForPageToSettle();

  assert.equal(pinnedAddressOf(page.document.querySelector("li")), "36 Winton Crescent, Murarrie");
});

test("Domain's featured carousel pins only the listing showing, and follows slide changes", async () => {
  // Bug fixed: every slide's address went into one map search, giving several pins.
  const page = loadListingPage({
    pageUrl: DOMAIN_SEARCH_URL,
    pageHtml: domainResultsHtml(domainFeaturedCarouselHtml(["77 Woodanga Street", "37 Tamba Street"], 0)),
  });
  await waitForPageToSettle();

  const featuredEntry = page.document.querySelector("#featured");
  assert.equal(pinnedAddressOf(featuredEntry), "77 Woodanga Street, Murarrie");

  const [firstSlide, secondSlide] = featuredEntry.querySelectorAll(".slick-slide");
  firstSlide.setAttribute("aria-hidden", "true");
  secondSlide.setAttribute("aria-hidden", "false");
  await waitForPageToSettle();

  assert.equal(pinnedAddressOf(featuredEntry), "37 Tamba Street, Murarrie");
  assert.equal(featuredEntry.querySelectorAll(".listing-map-embed").length, 1);
});

test("maps appear only in search results, not on property pages or Domain's map view", async () => {
  const pagesThatMustHaveNoMaps = [
    { pageUrl: "https://www.realestate.com.au/sold/property-apartment-vic-richmond-152488920", pageHtml: realestateResultsHtml(["402/486 Victoria Street, Richmond"]) },
    { pageUrl: "https://www.realestate.com.au/property-house-vic-richmond-152483668", pageHtml: realestateResultsHtml(["21 Baker Street, Richmond"]) },
    { pageUrl: `${DOMAIN_SEARCH_URL}?displaymap=1`, pageHtml: domainResultsHtml(domainListingHtml("36 Winton Crescent", "Murarrie")) },
    { pageUrl: "https://www.domain.com.au/36-winton-crescent-murarrie-qld-4172-2021328546", pageHtml: domainResultsHtml(domainListingHtml("36 Winton Crescent", "Murarrie")) },
  ];
  for (const { pageUrl, pageHtml } of pagesThatMustHaveNoMaps) {
    const page = loadListingPage({ pageUrl, pageHtml });
    await waitForPageToSettle();
    assert.equal(page.document.querySelectorAll(".listing-map-embed").length, 0, `maps shown on ${pageUrl}`);
  }

  // Cards outside realestate.com.au's results list (e.g. "similar properties") get no map.
  const searchPageWithOtherCards = loadListingPage({
    pageUrl: REALESTATE_SEARCH_URL,
    pageHtml: `<article><a href="/property-unit-vic-richmond-2">View</a><h2>1 Other Street, Richmond</h2></article>`,
  });
  await waitForPageToSettle();
  assert.equal(searchPageWithOtherCards.document.querySelectorAll(".listing-map-embed").length, 0);
});
