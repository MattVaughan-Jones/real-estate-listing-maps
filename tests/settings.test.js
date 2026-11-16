// Locks in the settings defaults, the reset of bad saved settings, and the popup's save rules.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSettingsPopup, waitForPageToSettle } = require("./load-extension-into-page");

const EXPECTED_DEFAULT_SETTINGS = {
  areMapsShowing: true,
  framingMode: "followPin",
  followPinZoomLevel: 15,
  fixedCentre: { latitude: -27.4698, longitude: 153.0251 }, // Brisbane CBD
  fixedCentreZoomLevel: 12,
};

const VALID_SAVED_SETTINGS = {
  areMapsShowing: true,
  framingMode: "fixed",
  followPinZoomLevel: 14,
  fixedCentre: { latitude: -27.5, longitude: 153.1 },
  fixedCentreZoomLevel: 11,
};

async function loadSettingsAsTheExtensionWould(savedSettings) {
  const popup = loadSettingsPopup({ savedSettings });
  const loadedSettings = await popup.runInPage("loadMapSettings()");
  return { loadedSettings: JSON.parse(JSON.stringify(loadedSettings)), popup };
}

test("a new user gets maps switched on, centred on the pin at zoom 15, with Brisbane CBD at zoom 12 for a fixed centre", async () => {
  const { loadedSettings } = await loadSettingsAsTheExtensionWould({});
  assert.deepEqual(loadedSettings, EXPECTED_DEFAULT_SETTINGS);
});

test("valid saved settings are kept", async () => {
  const { loadedSettings } = await loadSettingsAsTheExtensionWould(VALID_SAVED_SETTINGS);
  assert.deepEqual(loadedSettings, VALID_SAVED_SETTINGS);
});

test("settings saved before the on/off switch existed are kept, with maps switched on", async () => {
  const { areMapsShowing, ...settingsSavedBeforeTheSwitchExisted } = VALID_SAVED_SETTINGS;
  const { loadedSettings } = await loadSettingsAsTheExtensionWould(settingsSavedBeforeTheSwitchExisted);
  assert.deepEqual(loadedSettings, { ...settingsSavedBeforeTheSwitchExisted, areMapsShowing: true });
});

test("saved settings that don't match the current schema are reset to the defaults", async () => {
  const savedSettingsThatMustBeReset = {
    "settings from an older version": {
      ...VALID_SAVED_SETTINGS,
      fixedFramingMethod: "boundary", // the removed edge-points option
      boundaryAxis: "northSouth",
    },
    "a missing setting": { framingMode: "fixed", followPinZoomLevel: 14 },
    "an out-of-range zoom level": { ...VALID_SAVED_SETTINGS, followPinZoomLevel: 99 },
    "an unknown framing mode": { ...VALID_SAVED_SETTINGS, framingMode: "boundary" },
    "an on/off switch that isn't true or false": { ...VALID_SAVED_SETTINGS, areMapsShowing: "off" },
  };
  for (const [description, savedSettings] of Object.entries(savedSettingsThatMustBeReset)) {
    const { loadedSettings, popup } = await loadSettingsAsTheExtensionWould(savedSettings);
    assert.deepEqual(loadedSettings, EXPECTED_DEFAULT_SETTINGS, description);
    assert.deepEqual(popup.readSavedSettings(), EXPECTED_DEFAULT_SETTINGS, `${description}: storage not reset`);
  }
});

test("the centre point accepts decimal and Google Maps coordinates, and rejects anything else", () => {
  const popup = loadSettingsPopup();
  const parse = (coordinateText) =>
    JSON.parse(JSON.stringify(popup.runInPage(`parseCoordinateText(${JSON.stringify(coordinateText)})`)));

  assert.deepEqual(parse("-27.4698, 153.0251"), { latitude: -27.4698, longitude: 153.0251 });
  const fromGoogleMaps = parse(`27°21'51.4"S 153°01'18.5"E`);
  assert.ok(Math.abs(fromGoogleMaps.latitude - -27.364278) < 0.000001);
  assert.ok(Math.abs(fromGoogleMaps.longitude - 153.021806) < 0.000001);
  assert.equal(parse("Brisbane CBD"), null);
  assert.equal(parse("95, 10"), null, "latitude beyond 90 degrees");
});

async function fillPopupAndSave(popup, { framingMode, followPinZoomLevel, fixedCentre, fixedCentreZoomLevel }) {
  await waitForPageToSettle(); // let the popup fill itself from saved settings first
  const { document } = popup;
  document.querySelector(`input[name="framingMode"][value="${framingMode}"]`).checked = true;
  document.getElementById("follow-pin-zoom-level").value = followPinZoomLevel;
  document.getElementById("fixed-centre").value = fixedCentre;
  document.getElementById("fixed-centre-zoom-level").value = fixedCentreZoomLevel;
  document.getElementById("save-button").click();
  await waitForPageToSettle();
  return document.getElementById("save-status").textContent;
}

test("an invalid field in the hidden mode is reset to its default instead of blocking the save", async () => {
  const popup = loadSettingsPopup({ savedSettings: VALID_SAVED_SETTINGS });
  await fillPopupAndSave(popup, {
    framingMode: "followPin",
    followPinZoomLevel: "16",
    fixedCentre: "not a coordinate", // hidden while "Centre on each pin" is selected
    fixedCentreZoomLevel: "0", // also hidden, and out of range
  });

  assert.deepEqual(popup.readSavedSettings(), {
    areMapsShowing: true,
    framingMode: "followPin",
    followPinZoomLevel: 16,
    fixedCentre: EXPECTED_DEFAULT_SETTINGS.fixedCentre,
    fixedCentreZoomLevel: EXPECTED_DEFAULT_SETTINGS.fixedCentreZoomLevel,
  });
});

test("an invalid field the user can see blocks the save and explains why", async () => {
  const popup = loadSettingsPopup({ savedSettings: VALID_SAVED_SETTINGS });
  const statusMessage = await fillPopupAndSave(popup, {
    framingMode: "fixed",
    followPinZoomLevel: "15",
    fixedCentre: "not a coordinate",
    fixedCentreZoomLevel: "12",
  });

  assert.match(statusMessage, /isn't a valid coordinate/);
  assert.deepEqual(popup.readSavedSettings(), VALID_SAVED_SETTINGS, "nothing should have been saved");
});

async function flipMapsShowingSwitch(popup) {
  await waitForPageToSettle(); // let the popup fill itself from saved settings first
  const mapsShowingSwitch = popup.document.getElementById("maps-showing-switch");
  mapsShowingSwitch.click(); // flips it and fires "change", as a real click would
  await waitForPageToSettle();
  return popup.document.getElementById("save-status").textContent;
}

test("the on/off switch saves straight away, keeping the saved framing but not unsaved edits", async () => {
  const popup = loadSettingsPopup({ savedSettings: VALID_SAVED_SETTINGS });
  await waitForPageToSettle();
  popup.document.getElementById("fixed-centre-zoom-level").value = "20"; // edited but not saved

  const statusMessage = await flipMapsShowingSwitch(popup);

  assert.match(statusMessage, /Maps turned off/);
  assert.deepEqual(popup.readSavedSettings(), { ...VALID_SAVED_SETTINGS, areMapsShowing: false });
});

test("a new user who switches maps off stays switched off", async () => {
  // Saving the switch on its own would leave storage failing the schema check, and the next
  // load would reset it to the defaults, switching maps back on.
  const popup = loadSettingsPopup();
  await flipMapsShowingSwitch(popup);

  const { loadedSettings } = await loadSettingsAsTheExtensionWould(popup.readSavedSettings());
  assert.deepEqual(loadedSettings, { ...EXPECTED_DEFAULT_SETTINGS, areMapsShowing: false });
});
