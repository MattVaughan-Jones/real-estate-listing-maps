// Test helper: runs the extension's scripts inside a fake browser page (jsdom), the same way
// Chrome does: as plain scripts sharing one page, in the order manifest.json lists them.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const EXTENSION_FOLDER = path.join(__dirname, "..");
const CONTENT_SCRIPT_FILE_NAMES = ["map-settings.js", "listing-site-adapters.js", "add-listing-maps.js"];
const POPUP_SCRIPT_FILE_NAMES = ["map-settings.js", "settings-popup.js"];

const copyPlainData = (value) => JSON.parse(JSON.stringify(value));

// Stands in for chrome.storage.sync: settings live in a plain object the test can inspect.
function createFakeChromeStorage(initiallySavedSettings) {
  let savedSettings = copyPlainData(initiallySavedSettings);
  const changeListeners = [];
  const notifyChangeListeners = () => changeListeners.forEach((changeListener) => changeListener());
  const chrome = {
    storage: {
      sync: {
        // get(null) returns everything saved; get(defaults) fills in anything not saved.
        get: async (defaultsOrNull) =>
          defaultsOrNull === null
            ? copyPlainData(savedSettings)
            : { ...copyPlainData(defaultsOrNull), ...copyPlainData(savedSettings) },
        set: async (settingsToSave) => {
          Object.assign(savedSettings, copyPlainData(settingsToSave));
          notifyChangeListeners();
        },
        clear: async () => {
          savedSettings = {};
          notifyChangeListeners();
        },
      },
      onChanged: { addListener: (changeListener) => changeListeners.push(changeListener) },
    },
  };
  return { chrome, readSavedSettings: () => copyPlainData(savedSettings) };
}

function loadScriptsIntoPage({ pageUrl, pageHtml, scriptFileNames, savedSettings = {} }) {
  // "dangerously" only means scripts we add run; the page's own <script src> tags are never
  // fetched, because jsdom doesn't load external files unless asked to.
  const fakePage = new JSDOM(pageHtml, { url: pageUrl, runScripts: "dangerously" });
  const fakeStorage = createFakeChromeStorage(savedSettings);
  fakePage.window.chrome = fakeStorage.chrome;
  // Added as <script> tags, not eval'd, so top-level consts are shared between files as in Chrome.
  for (const scriptFileName of scriptFileNames) {
    const scriptElement = fakePage.window.document.createElement("script");
    scriptElement.textContent = fs.readFileSync(path.join(EXTENSION_FOLDER, scriptFileName), "utf8");
    fakePage.window.document.body.appendChild(scriptElement);
  }
  return {
    document: fakePage.window.document,
    readSavedSettings: fakeStorage.readSavedSettings,
    // Evaluates code in the page, e.g. to call a function the scripts define.
    runInPage: (code) => fakePage.window.eval(code),
  };
}

function loadListingPage({ pageUrl, pageHtml, savedSettings }) {
  return loadScriptsIntoPage({ pageUrl, pageHtml, savedSettings, scriptFileNames: CONTENT_SCRIPT_FILE_NAMES });
}

function loadSettingsPopup({ savedSettings } = {}) {
  const popupHtml = fs.readFileSync(path.join(EXTENSION_FOLDER, "settings-popup.html"), "utf8");
  return loadScriptsIntoPage({
    pageUrl: "chrome-extension://listing-maps/settings-popup.html",
    pageHtml: popupHtml,
    savedSettings,
    scriptFileNames: POPUP_SCRIPT_FILE_NAMES,
  });
}

// Lets the scripts finish their async work: loading settings and reacting to page changes.
const waitForPageToSettle = () => new Promise((resolve) => setTimeout(resolve, 20));

module.exports = { loadListingPage, loadSettingsPopup, waitForPageToSettle };
