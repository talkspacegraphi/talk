const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'logo.png');
const outputPath = path.join(__dirname, 'apps/desktop/build/icon.ico');

console.log('Converting PNG to ICO...');
console.log('Input:', inputPath);
console.log('Output:', outputPath);

(async () => {
  try {
    const buf = await pngToIco(inputPath);
    fs.writeFileSync(outputPath, buf);
    console.log('✓ ICO file created successfully!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
