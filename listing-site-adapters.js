// Each supported site lays out its search results differently. An adapter tells the map
// script, for one site:
//   isSearchResultsListShowing()     true only on a search results page in list view; maps
//                                    appear nowhere else (not on property, agent or home
//                                    pages, nor where the site already shows its own map)
//   findListingCards()               the elements to put a map beside, one per listing
//   readListingAddress(listingCard)  that listing's street address
//   attributesThatChangeVisibleListing  attribute names whose change can swap which
//                                    listing's address is showing (e.g. a carousel slide
//                                    change), so the map script re-checks when they change
//
// The selectors below were checked against the live sites in November 2026. If maps stop
// appearing, the site has probably changed its markup; the browser console will say so
// (see add-listing-maps.js).

// A URL path ending in a long number is a single property's page, not a search.
const PROPERTY_DETAIL_PAGE_PATH = /-\d{6,}\/?$/;

const LISTING_SITE_ADAPTERS = {
  "www.realestate.com.au": {
    isSearchResultsListShowing() {
      // Searches are /buy/..., /rent/... or /sold/.... Sold property pages also start with
      // /sold/ (e.g. /sold/property-apartment-vic-richmond-152488920), so exclude those.
      const isSearchPath = /^\/(buy|rent|sold)\//.test(location.pathname);
      return isSearchPath && !PROPERTY_DETAIL_PAGE_PATH.test(location.pathname);
    },

    findListingCards() {
      // Each result card is an <article> in the search results list.
      return [...document.querySelectorAll("ul.tiered-results article")];
    },

    readListingAddress(listingCard) {
      // The address is shown as the card's heading.
      const addressHeading = listingCard.querySelector("h2");
      return addressHeading ? addressHeading.textContent.trim() : null;
    },

    attributesThatChangeVisibleListing: [],
  },

  "www.domain.com.au": {
    isSearchResultsListShowing() {
      // Searches are /sale/..., /rent/... or /sold-listings/...; property pages have no
      // such prefix. Map view is the same page with ?displaymap=1 and has its own map.
      const isSearchPath = /^\/(sale|rent|sold-listings)\//.test(location.pathname);
      const isMapView = new URLSearchParams(location.search).has("displaymap");
      return isSearchPath && !isMapView;
    },

    findListingCards() {
      // Returns the <li> around each card in the main results list, not the card itself: the
      // card hides anything outside its edges, so a map attached to it would be invisible.
      // Limiting to the results list skips the carousel of other listings lower on the page.
      const resultListItems = document.querySelectorAll('[data-testid="results"] > li');
      return [...resultListItems].filter((resultListItem) =>
        resultListItem.querySelector('[data-testid^="listing-card-wrapper"]')
      );
    },

    readListingAddress(listingCard) {
      // A "Featured properties" entry is a carousel of several listings (plus copies of
      // them for wrap-around scrolling). Only the slide currently showing counts: reading
      // every slide would send all their addresses to the map at once, giving several pins.
      // Ordinary listings have a photo carousel too, so only slides that contain a whole
      // listing card count; for an ordinary listing there are none, and the whole card is used.
      const elementContainingVisibleListing =
        listingCard.querySelector(
          '.slick-slide[aria-hidden="false"]:has([data-testid^="listing-card-wrapper"])'
        ) ?? listingCard;

      // The address is split over two lines: "296 Kitchener Road, " and "Stafford Heights".
      const addressLines = elementContainingVisibleListing.querySelectorAll(
        '[data-testid="address-line1"], [data-testid="address-line2"]'
      );
      const address = [...addressLines].map((addressLine) => addressLine.textContent.trim()).join(" ");
      return address || null;
    },

    // The featured carousel marks the slide showing with aria-hidden="false".
    attributesThatChangeVisibleListing: ["aria-hidden"],
  },
};
