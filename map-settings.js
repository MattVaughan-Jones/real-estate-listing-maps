// Map framing settings, shared by the settings popup and the listing page script.
// Saved in chrome.storage.sync so they persist and open listing pages can react to changes.

const MAP_FRAMING_MODES = {
  followPin: "followPin", // every map is centred on its listing's pin
  fixed: "fixed", // every map shows the same area; only the pin moves
};

// Google Maps zoom levels: 1 shows the whole world, 21 shows individual buildings.
const MINIMUM_ZOOM_LEVEL = 1;
const MAXIMUM_ZOOM_LEVEL = 21;

// Used until the user saves their own settings. Its keys are also the settings schema:
// saved settings with any other set of keys are discarded (see loadMapSettings).
const DEFAULT_MAP_SETTINGS = {
  framingMode: MAP_FRAMING_MODES.followPin,
  followPinZoomLevel: 15,
  fixedCentre: { latitude: -27.4698, longitude: 153.0251 }, // Brisbane CBD
  fixedCentreZoomLevel: 12,
};

function isValidZoomLevel(zoomLevel) {
  return (
    Number.isInteger(zoomLevel) &&
    zoomLevel >= MINIMUM_ZOOM_LEVEL &&
    zoomLevel <= MAXIMUM_ZOOM_LEVEL
  );
}

function isValidGeographicPoint(geographicPoint) {
  return (
    typeof geographicPoint === "object" &&
    geographicPoint !== null &&
    Number.isFinite(geographicPoint.latitude) &&
    Number.isFinite(geographicPoint.longitude) &&
    Math.abs(geographicPoint.latitude) <= 90 &&
    Math.abs(geographicPoint.longitude) <= 180
  );
}

// True only when the saved settings have exactly the current schema's keys, each valid.
// Settings saved by an older version (e.g. one with the removed edge-points option) fail this.
function doSavedSettingsMatchSchema(savedSettings) {
  const savedKeys = Object.keys(savedSettings).sort();
  const schemaKeys = Object.keys(DEFAULT_MAP_SETTINGS).sort();
  const hasExactlySchemaKeys = savedKeys.join(",") === schemaKeys.join(",");
  return (
    hasExactlySchemaKeys &&
    Object.values(MAP_FRAMING_MODES).includes(savedSettings.framingMode) &&
    isValidZoomLevel(savedSettings.followPinZoomLevel) &&
    isValidGeographicPoint(savedSettings.fixedCentre) &&
    isValidZoomLevel(savedSettings.fixedCentreZoomLevel)
  );
}

// Returns the saved settings, or the defaults if nothing has been saved yet. Saved settings
// that don't match the schema are erased and replaced with the defaults.
async function loadMapSettings() {
  const savedSettings = await chrome.storage.sync.get(null); // null reads every saved key
  const hasSavedSettings = Object.keys(savedSettings).length > 0;
  if (!hasSavedSettings) return DEFAULT_MAP_SETTINGS;
  if (doSavedSettingsMatchSchema(savedSettings)) return savedSettings;

  await chrome.storage.sync.clear();
  await chrome.storage.sync.set(DEFAULT_MAP_SETTINGS);
  return DEFAULT_MAP_SETTINGS;
}

function saveMapSettings(mapSettings) {
  return chrome.storage.sync.set(mapSettings);
}
