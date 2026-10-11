#!/usr/bin/env node

/**
 * Build and packaging script for Gemini Grammar & Rephrase Helper
 * Generates ready-to-upload ZIP packages and unpacked folders for:
 *   - Google Chrome Web Store
 *   - Mozilla Firefox Add-ons (AMO)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Common files to include in both browser distributions
const CORE_FILES = [
  'background.js',
  'content.js',
  'options.html',
  'options.js',
  'style.css'
];

const CORE_DIRS = [
  'images'
];

function parseArgs() {
  const targetArg = process.argv.find(arg => arg.startsWith('--target='));
  if (targetArg) {
    return targetArg.split('=')[1].toLowerCase();
  }
  return 'all';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyCommonFiles(targetDir) {
  CORE_FILES.forEach(file => {
    const src = path.join(ROOT_DIR, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`[WARN] Missing expected file: ${file}`);
    }
  });

  CORE_DIRS.forEach(dir => {
    const src = path.join(ROOT_DIR, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      console.warn(`[WARN] Missing expected directory: ${dir}`);
    }
  });
}

function createZip(folderPath, zipName) {
  const zipPath = path.join(DIST_DIR, zipName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Use system zip utility with cwd set inside the target folder
  execSync(`zip -r -q "${zipPath}" .`, { cwd: folderPath });
  const stats = fs.statSync(zipPath);
  const sizeKb = (stats.size / 1024).toFixed(1);
  return { path: zipPath, sizeKb };
}

function buildChrome(baseManifest) {
  console.log('\n📦 Building Chrome distribution...');
  const outDir = path.join(DIST_DIR, 'chrome');
  cleanDir(outDir);

  // Copy common assets & scripts
  copyCommonFiles(outDir);

  // Chrome uses the root manifest.json as-is
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(baseManifest, null, 2) + '\n'
  );

  const zipName = `gemini-grammar-rephrase-chrome-v${baseManifest.version}.zip`;
  const zipResult = createZip(outDir, zipName);

  console.log(`   ✅ Chrome unpacked folder : dist/chrome/`);
  console.log(`   ✅ Chrome upload package  : dist/${zipName} (${zipResult.sizeKb} KB)`);
}

function buildFirefox(baseManifest) {
  console.log('\n🦊 Building Firefox (AMO) distribution...');
  const outDir = path.join(DIST_DIR, 'firefox');
  cleanDir(outDir);

  // Copy common assets & scripts
  copyCommonFiles(outDir);

  // Read Firefox specific configuration
  let geckoId = 'gemini-grammar-rephrase@wdraihan';
  let minVersion = '109.0';

  const configPath = path.join(ROOT_DIR, 'firefox-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.gecko_id) geckoId = config.gecko_id;
      if (config.strict_min_version) minVersion = config.strict_min_version;
    } catch (err) {
      console.warn(`[WARN] Could not parse firefox-config.json, using defaults:`, err.message);
    }
  }

  // Deep clone manifest and transform for Firefox WebExtension requirements
  const ffManifest = JSON.parse(JSON.stringify(baseManifest));

  // 1. Add browser_specific_settings required by Firefox AMO
  ffManifest.browser_specific_settings = {
    gecko: {
      id: geckoId,
      strict_min_version: minVersion
    }
  };

  // 2. Firefox background scripts (supports scripts array for maximum compatibility)
  ffManifest.background = {
    scripts: ['background.js']
  };

  // 3. Modern Firefox options_ui configuration
  delete ffManifest.options_page;
  ffManifest.options_ui = {
    page: 'options.html',
    open_in_tab: true
  };

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(ffManifest, null, 2) + '\n'
  );

  const zipName = `gemini-grammar-rephrase-firefox-v${baseManifest.version}.zip`;
  const zipResult = createZip(outDir, zipName);

  console.log(`   ✅ Firefox Gecko ID       : ${geckoId}`);
  console.log(`   ✅ Firefox unpacked folder : dist/firefox/`);
  console.log(`   ✅ Firefox upload package : dist/${zipName} (${zipResult.sizeKb} KB)`);
}

function main() {
  const target = parseArgs();
  console.log(`🚀 Starting extension build (Target: ${target.toUpperCase()})...`);

  ensureDir(DIST_DIR);

  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ Error: manifest.json not found in root directory.');
    process.exit(1);
  }

  const baseManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (target === 'all' || target === 'chrome') {
    buildChrome(baseManifest);
  }

  if (target === 'all' || target === 'firefox') {
    buildFirefox(baseManifest);
  }

  console.log('\n✨ Build complete! Packages are ready in ./dist/\n');
}

main();
