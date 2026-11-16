// The popup opened from the extension's toolbar icon. Has a switch to turn maps on and off,
// shows only the settings that apply to the chosen framing mode, and saves them for the
// listing pages to use.

const mapsShowingSwitch = document.getElementById("maps-showing-switch");

const followPinSettingsSection = document.getElementById("follow-pin-settings");
const fixedCentreSettingsSection = document.getElementById("fixed-centre-settings");

const followPinZoomLevelInput = document.getElementById("follow-pin-zoom-level");
const fixedCentreInput = document.getElementById("fixed-centre");
const fixedCentreZoomLevelInput = document.getElementById("fixed-centre-zoom-level");

const saveButton = document.getElementById("save-button");
const saveStatusMessage = document.getElementById("save-status");

// The two radio buttons that choose between following the pin and a fixed centre.
const FRAMING_MODE_RADIO_SELECTOR = 'input[name="framingMode"]';

function readSelectedFramingMode() {
  return document.querySelector(`${FRAMING_MODE_RADIO_SELECTOR}:checked`).value;
}

function selectFramingMode(framingMode) {
  document.querySelector(`${FRAMING_MODE_RADIO_SELECTOR}[value="${framingMode}"]`).checked = true;
}

// Shows the settings for the chosen framing mode and hides the other mode's.
function showSettingsForSelectedFramingMode() {
  const framingMode = readSelectedFramingMode();
  followPinSettingsSection.hidden = framingMode !== MAP_FRAMING_MODES.followPin;
  fixedCentreSettingsSection.hidden = framingMode !== MAP_FRAMING_MODES.fixed;
}

// Converts one degrees-minutes-seconds value (e.g. 27°21'51.4"S) to signed decimal degrees.
function degreesMinutesSecondsToDecimal(degrees, minutes, seconds, compassDirection) {
  const unsignedDecimalDegrees = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  const isSouthOrWest = /[SW]/i.test(compassDirection);
  return isSouthOrWest ? -unsignedDecimalDegrees : unsignedDecimalDegrees;
}

// Accepts "-27.4698, 153.0251" or Google Maps' format, 27°28'11.3"S 153°01'30.4"E.
// Returns { latitude, longitude }, or null if the text isn't a valid coordinate.
function parseCoordinateText(coordinateText) {
  const decimalCoordinateMatch = coordinateText
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  const degreesMinutesSecondsMatches = [
    ...coordinateText.matchAll(/(\d+)°\s*(\d+)['′]\s*(\d+(?:\.\d+)?)["″]\s*([NSEW])/gi),
  ];

  let latitude;
  let longitude;
  if (decimalCoordinateMatch) {
    latitude = Number(decimalCoordinateMatch[1]);
    longitude = Number(decimalCoordinateMatch[2]);
  } else if (degreesMinutesSecondsMatches.length === 2) {
    const [latitudeMatch, longitudeMatch] = degreesMinutesSecondsMatches;
    const [, latitudeDegrees, latitudeMinutes, latitudeSeconds, latitudeCompassDirection] =
      latitudeMatch;
    const [, longitudeDegrees, longitudeMinutes, longitudeSeconds, longitudeCompassDirection] =
      longitudeMatch;
    latitude = degreesMinutesSecondsToDecimal(
      latitudeDegrees,
      latitudeMinutes,
      latitudeSeconds,
      latitudeCompassDirection
    );
    longitude = degreesMinutesSecondsToDecimal(
      longitudeDegrees,
      longitudeMinutes,
      longitudeSeconds,
      longitudeCompassDirection
    );
  } else {
    return null;
  }

  const geographicPoint = { latitude, longitude };
  return isValidGeographicPoint(geographicPoint) ? geographicPoint : null;
}

function formatCoordinateForDisplay(coordinate) {
  return `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
}

function parseZoomLevelText(zoomLevelText) {
  const zoomLevel = Number(zoomLevelText);
  return isValidZoomLevel(zoomLevel) ? zoomLevel : null;
}

function fillFormFromSettings(mapSettings) {
  mapsShowingSwitch.checked = mapSettings.areMapsShowing;
  selectFramingMode(mapSettings.framingMode);
  followPinZoomLevelInput.value = mapSettings.followPinZoomLevel;
  fixedCentreInput.value = formatCoordinateForDisplay(mapSettings.fixedCentre);
  fixedCentreZoomLevelInput.value = mapSettings.fixedCentreZoomLevel;
  showSettingsForSelectedFramingMode();
}

// Reads every field. Returns { mapSettings } or, if a field the user can see is invalid,
// { errorMessage }. An invalid field in the hidden mode can't be seen or fixed, so instead of
// blocking the save it is reset to its default.
function readSettingsFromForm() {
  const framingMode = readSelectedFramingMode();
  const isFollowPinModeShowing = framingMode === MAP_FRAMING_MODES.followPin;
  let followPinZoomLevel = parseZoomLevelText(followPinZoomLevelInput.value);
  let fixedCentreZoomLevel = parseZoomLevelText(fixedCentreZoomLevelInput.value);
  let fixedCentre = parseCoordinateText(fixedCentreInput.value);

  const zoomLevelRequirementText = `must be a whole number from ${MINIMUM_ZOOM_LEVEL} to ${MAXIMUM_ZOOM_LEVEL}`;
  if (isFollowPinModeShowing) {
    if (followPinZoomLevel === null) {
      return { errorMessage: `Zoom level ${zoomLevelRequirementText}.` };
    }
    fixedCentreZoomLevel ??= DEFAULT_MAP_SETTINGS.fixedCentreZoomLevel;
    fixedCentre ??= DEFAULT_MAP_SETTINGS.fixedCentre;
  } else {
    if (!fixedCentre) return { errorMessage: "Centre point isn't a valid coordinate." };
    if (fixedCentreZoomLevel === null) {
      return { errorMessage: `Zoom level ${zoomLevelRequirementText}.` };
    }
    followPinZoomLevel ??= DEFAULT_MAP_SETTINGS.followPinZoomLevel;
  }

  const areMapsShowing = mapsShowingSwitch.checked;
  return {
    mapSettings: { areMapsShowing, framingMode, followPinZoomLevel, fixedCentre, fixedCentreZoomLevel },
  };
}

function showSaveStatus(statusMessage, { isError = false } = {}) {
  saveStatusMessage.classList.toggle("error", isError);
  saveStatusMessage.textContent = statusMessage;
}

// The switch takes effect straight away, like most on/off switches, without pressing Save.
// It saves alongside the already-saved framing settings, not any unsaved edits in the form.
async function saveMapsShowingSwitch() {
  const savedMapSettings = await loadMapSettings();
  const areMapsShowing = mapsShowingSwitch.checked;
  await saveMapSettings({ ...savedMapSettings, areMapsShowing });
  showSaveStatus(`Maps turned ${areMapsShowing ? "on" : "off"}. Open listing pages update automatically.`);
}

async function saveSettingsFromForm() {
  const { mapSettings, errorMessage } = readSettingsFromForm();
  if (errorMessage) {
    showSaveStatus(errorMessage, { isError: true });
    return;
  }
  await saveMapSettings(mapSettings);
  // Re-fill the form so a pasted degrees-minutes-seconds centre is shown in decimal form.
  fillFormFromSettings(mapSettings);
  showSaveStatus("Saved. Open listing pages update automatically.");
}

// The zoom limits live in map-settings.js; apply them to both zoom fields' spinners.
for (const zoomLevelInput of [followPinZoomLevelInput, fixedCentreZoomLevelInput]) {
  zoomLevelInput.min = MINIMUM_ZOOM_LEVEL;
  zoomLevelInput.max = MAXIMUM_ZOOM_LEVEL;
}
document.querySelectorAll(FRAMING_MODE_RADIO_SELECTOR).forEach((framingModeRadio) => {
  framingModeRadio.addEventListener("change", showSettingsForSelectedFramingMode);
});
mapsShowingSwitch.addEventListener("change", saveMapsShowingSwitch);
saveButton.addEventListener("click", saveSettingsFromForm);
loadMapSettings().then(fillFormFromSettings);
