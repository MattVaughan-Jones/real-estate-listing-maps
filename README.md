# Listing Maps

A Chrome extension that shows a small Google Map beside every listing when you search on
**realestate.com.au** or **domain.com.au**, so you can see where each property is while you
scroll through the results.

## Install

The extension isn't on the Chrome Web Store, so you load it into Chrome yourself. It takes
about a minute.

1. **Download it.** On this page, click **Code → Download ZIP** and unzip it. Or, if you use git:
   ```bash
   git clone https://github.com/<owner>/listing-maps.git
   ```
2. **Open Chrome's extensions page.** Go to `chrome://extensions` in the address bar.
3. **Turn on Developer mode** with the switch in the top-right corner.
4. **Click Load unpacked** and choose the folder you downloaded (the one containing
   `manifest.json`).
5. **Pin it (optional).** Click the puzzle-piece icon in Chrome's toolbar and pin
   **Listing Maps**, so its settings are one click away.

## Use

Search for properties on [realestate.com.au](https://www.realestate.com.au) or
[domain.com.au](https://www.domain.com.au). A map appears to the right of each listing, with
a pin on the property's address.

- Maps appear on search results for buying, renting and sold properties.
- On domain.com.au, maps appear in **list view** only. Map view already has its own map.
- Maps don't appear on individual property pages or anywhere else on either site.

### Settings

Click the **Listing Maps** icon in Chrome's toolbar to choose how the maps are framed:

- **Centre on each pin** (the default): each map is centred on its property. Set how far it's
  zoomed in (1 shows the whole world, 21 shows individual buildings; the default is 15).
- **Same area for every map**: every map shows the same area, so you can compare where
  properties are. Set the centre point and zoom level. The default is Brisbane CBD at zoom 12.
  The centre point can be decimal (`-27.4698, 153.0251`) or copied from Google Maps
  (`27°28'11.3"S 153°01'30.4"E`): right-click a spot in Google Maps and click the coordinates
  to copy them.

Click **Save**. Any open search pages update straight away.

### Updating

Download the latest version (or run `git pull`), then click the reload icon on
**Listing Maps** at `chrome://extensions`.

### If maps stop appearing

The extension reads each site's pages, so a redesign of either site can break it. Check the
[issues](../../issues) to see if it's already reported, or open a new one saying which site
and page.

---

## Contributing

Contributions are welcome, especially support for more property sites and fixes when a
site changes its pages.

### How it works

There's no build step: Chrome loads the files in this folder as they are.

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome which sites to run on and which files to load. |
| `listing-site-adapters.js` | Everything specific to each site: which pages are search results, where the listings are, and how to read an address. |
| `add-listing-maps.js` | Adds a map beside each listing and keeps it in step as the page changes. |
| `map-settings.js` | The settings, their defaults, and loading/saving them. |
| `settings-popup.*` | The settings popup opened from the toolbar icon. |
| `listing-map.css` | Where the map sits beside each listing. |
| `icons/` | `listing-maps-icon.svg` is the source; the PNGs are generated from it (steps are in a comment inside the SVG). |

### Running the tests

You'll need [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm test
```

The tests run the extension's scripts in a simulated page, so they don't need Chrome. They
also run automatically on every pull request.

### Adding a site

1. Add an entry to `LISTING_SITE_ADAPTERS` in `listing-site-adapters.js`, keyed by the
   site's hostname. The comment at the top of that file describes what each entry provides.
2. Add the site to `matches` in `manifest.json`.
3. Add tests in `tests/listing-maps.test.js`, with a small HTML fixture copying the parts
   of the site's markup your adapter relies on.
4. Load the extension in Chrome and check it on the live site.

### Pull requests

- Keep changes small and focused. The goal is a simple tool that does one thing well.
- If you fix a bug, add a test that fails without your fix.
- Use descriptive names: code should be easy to understand when reviewing it.

## Disclaimer

This project is not affiliated with or endorsed by realestate.com.au, Domain, or Google.
Maps are provided by Google Maps.

## License

[MIT](LICENSE) © 2026 Matt Vaughan-Jones
