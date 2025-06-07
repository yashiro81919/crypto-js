// Node.js script to minify and obfuscate all JS files in ./dist

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputDir = 'out';
const minifiedDir = 'dist/min';
const obfuscatedDir = 'dist/obf';

// Create output folders
fs.mkdirSync(minifiedDir, { recursive: true });
fs.mkdirSync(obfuscatedDir, { recursive: true });

const files = fs.readdirSync(inputDir, {recursive: true}).filter(f => f.endsWith('.js'));

for (const file of files) {
  const inputFile = path.join(inputDir, file);
  const minifiedFile = path.join(minifiedDir, file);
  const obfuscatedFile = path.join(obfuscatedDir, file);

  console.log(`Minifying ${file}...`);
  execSync(`npx terser "${inputFile}" -o "${minifiedFile}" --compress --mangle`);

  console.log(`Obfuscating ${file}...`);
  execSync(`npx javascript-obfuscator "${minifiedFile}" --output "${obfuscatedFile}"`);
}

console.log('✅ Done: All files minified and obfuscated.');