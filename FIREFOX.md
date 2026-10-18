# Firefox (AMO) Publishing & Update Guide

This guide explains how to update and submit the **Gemini Grammar & Rephrase Helper** extension to Mozilla Firefox Add-ons (AMO).

---

## 1. Set Your Firefox Add-on ID (Gecko ID)

Because your extension is **already published on Firefox**, AMO requires that all future updates use the **exact same Extension ID**.

1. Open [`firefox-config.json`](file:///Users/raihan/Chrome%20extensions/Gemini-Grammar-Rephrase-Helper/firefox-config.json).
2. Replace `"gemini-grammar-rephrase@wdraihan"` with your actual ID from your [AMO Developer Hub](https://addons.mozilla.org/developers/addons):

```json
{
  "gecko_id": "YOUR_ACTUAL_AMO_ID@here",
  "strict_min_version": "109.0"
}
```

> 💡 **Where to find your Gecko ID:**
> Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers) → Click your Add-on → Look under **Technical Information** for **Add-on ID** (or check your previously submitted `manifest.json`).

---

## 2. Build the Firefox Package

In the extension project root directory, run:

```bash
npm run build:firefox
```

This will automatically:
- Pull your latest code (`background.js`, `content.js`, `options.*`, `style.css`, icons).
- Transform the manifest for Firefox MV3 (adding your Gecko ID, configuring `background.scripts`, and setting `options_ui`).
- Output:
  - **Unpacked Folder**: `dist/firefox/` (for local testing in Firefox)
  - **Ready-to-Upload ZIP**: `dist/gemini-grammar-rephrase-firefox-v1.2.2.zip`

---

## 3. Test Locally in Firefox (Optional but Recommended)

Before uploading to AMO, you can quickly test the changes in Firefox:

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `dist/firefox/manifest.json` file.
4. Test:
   - Select text on any web page.
   - Right-click → **Fix Grammar & Rephrase**.
   - Check that the modal displays Gemini suggestions and copy buttons work.
   - Click the extension icon to verify the options page opens and saves your Gemini API key.

---

## 4. Upload the Update to AMO

1. Log into the [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. Select your extension: **Gemini Grammar & Rephrase Helper**.
3. Click **Upload New Version** (or **Submit a New Version**).
4. Drag and drop the generated file:
   `dist/gemini-grammar-rephrase-firefox-v1.2.2.zip`
5. The automated AMO linter will validate the package.
6. Under **Reviewer Notes**, you can state:
   > "Upgraded to Manifest V3 with Google Gemini 2.5 / 2.0 Flash support, structured JSON outputs, improved keyboard shortcuts, and enhanced modal UI."
7. Submit for review!
