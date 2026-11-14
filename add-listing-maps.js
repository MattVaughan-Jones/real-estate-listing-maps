// Adds a Google Maps embed beside every listing card in property search results.
// Google's keyless embed URL does the address lookup, so no geocoding or API key is needed.
// How each map is framed comes from the user's settings (see map-settings.js), and how each
// site's listings are found comes from its adapter (see listing-site-adapters.js).

const LISTING_MAP_CLASS = "listing-map-embed";
// Marks a card that has a map beside it. Keep in sync with the selector in listing-map.css.
const LISTING_CARD_HAS_MAP_ATTRIBUTE_NAME = "data-listing-map-added";

// Undefined if manifest.json runs this script on a site with no adapter; then it does nothing.
const adapterForThisSite = LISTING_SITE_ADAPTERS[location.hostname];

// Settings are loaded asynchronously; this stays null, and no maps are added, until they arrive.
let loadedMapSettingsOrNull = null;

// Logged at most once per page, so a site markup change doesn't flood the console.
let hasWarnedAboutUnreadableAddresses = false;

// Returns how every map should be framed: fixedCentreOrNull is null when following the pin.
function chooseMapView(mapSettings) {
  if (mapSettings.framingMode === MAP_FRAMING_MODES.followPin) {
    return { fixedCentreOrNull: null, zoomLevel: mapSettings.followPinZoomLevel };
  }
  return { fixedCentreOrNull: mapSettings.fixedCentre, zoomLevel: mapSettings.fixedCentreZoomLevel };
}

function buildMapUrl(address, mapView) {
  // q places the pin. ll fixes the centre; leaving it out makes Google centre on the pin.
  const mapCentreParameter = mapView.fixedCentreOrNull
    ? `&ll=${mapView.fixedCentreOrNull.latitude},${mapView.fixedCentreOrNull.longitude}`
    : "";
  return (
    `https://maps.google.com/maps?q=${encodeURIComponent(address)}` +
    `${mapCentreParameter}&z=${mapView.zoomLevel}&output=embed`
  );
}

function createEmptyMapIframe() {
  const mapIframe = document.createElement("iframe");
  mapIframe.className = LISTING_MAP_CLASS;
  mapIframe.loading = "lazy";
  return mapIframe;
}

function removeMapFromListingCard(listingCard) {
  listingCard.querySelector(`.${LISTING_MAP_CLASS}`)?.remove();
  listingCard.removeAttribute(LISTING_CARD_HAS_MAP_ATTRIBUTE_NAME);
}

// Removes maps from elements that are no longer listing cards with a readable address, e.g.
// a reused element the site has turned into an ad, or every card once the user leaves the
// search results list.
function removeMapsExceptFrom(listingCardsThatKeepTheirMap) {
  for (const elementWithMap of document.querySelectorAll(`[${LISTING_CARD_HAS_MAP_ATTRIBUTE_NAME}]`)) {
    if (!listingCardsThatKeepTheirMap.has(elementWithMap)) {
      removeMapFromListingCard(elementWithMap);
    }
  }
}

function warnOnceIfNoAddressesCouldBeRead(listingCardCount, readableAddressCount) {
  if (hasWarnedAboutUnreadableAddresses) return;
  if (listingCardCount > 0 && readableAddressCount === 0) {
    hasWarnedAboutUnreadableAddresses = true;
    console.warn(
      `[Listing Maps] Found ${listingCardCount} listing cards but couldn't read any addresses. ` +
        `${location.hostname} has probably changed its page markup; update its adapter in ` +
        `listing-site-adapters.js.`
    );
  }
}

// Sites reuse listing cards when results change (e.g. moving to page 2), swapping only
// the text inside them, and the user can change settings at any time. So every run rebuilds
// each map's URL from its card's current address and the current settings, reloads the map
// only if that URL has changed, and removes maps from anything that is no longer a listing.
function syncMapsWithListingsAndSettings() {
  if (!loadedMapSettingsOrNull) return; // settings not loaded yet

  // Maps appear only in a search results list, never on other pages or in a site's map view.
  if (!adapterForThisSite.isSearchResultsListShowing()) {
    removeMapsExceptFrom(new Set());
    return;
  }

  // The framing is the same for every listing; only the pinned address differs.
  const mapView = chooseMapView(loadedMapSettingsOrNull);
  const listingCards = adapterForThisSite.findListingCards();
  const listingCardsWithReadableAddress = new Set();

  for (const listingCard of listingCards) {
    const listingAddress = adapterForThisSite.readListingAddress(listingCard);
    if (!listingAddress) continue; // its map, if any, is removed below

    listingCardsWithReadableAddress.add(listingCard);
    let listingMapIframe = listingCard.querySelector(`.${LISTING_MAP_CLASS}`);
    if (!listingMapIframe) {
      listingMapIframe = createEmptyMapIframe();
      listingCard.setAttribute(LISTING_CARD_HAS_MAP_ATTRIBUTE_NAME, "");
      listingCard.appendChild(listingMapIframe);
    }

    const desiredMapUrl = buildMapUrl(listingAddress, mapView);
    if (listingMapIframe.dataset.loadedMapUrl !== desiredMapUrl) {
      listingMapIframe.dataset.loadedMapUrl = desiredMapUrl;
      listingMapIframe.src = desiredMapUrl;
    }
  }

  // A reused card with no readable address must not keep the previous listing's map.
  removeMapsExceptFrom(listingCardsWithReadableAddress);
  warnOnceIfNoAddressesCouldBeRead(listingCards.length, listingCardsWithReadableAddress.size);
}

function startAddingListingMaps() {
  loadMapSettings().then((savedMapSettings) => {
    loadedMapSettingsOrNull = savedMapSettings;
    syncMapsWithListingsAndSettings();
  });

  // Apply settings saved from the popup to this page straight away. The extension stores
  // nothing else, so any storage change means the map settings may have changed.
  chrome.storage.onChanged.addListener(async () => {
    loadedMapSettingsOrNull = await loadMapSettings();
    syncMapsWithListingsAndSettings();
  });

  // Results load and change without a full page reload, so re-check whenever the page
  // changes. characterData catches the site editing a card's address text in place; the
  // adapter's attributes catch e.g. a carousel moving to another slide, which changes which
  // listing's address is showing without adding or removing anything.
  const watchedAttributeNames = adapterForThisSite.attributesThatChangeVisibleListing;
  new MutationObserver(syncMapsWithListingsAndSettings).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    ...(watchedAttributeNames.length > 0 && {
      attributes: true,
      attributeFilter: watchedAttributeNames,
    }),
  });
}

if (adapterForThisSite) {
  startAddingListingMaps();
}
