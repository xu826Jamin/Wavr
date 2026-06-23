// Make a 1:1 avatar still (on #050505) to use as the image-to-video start frame for the Grok spike.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
(async () => {
  await sharp(path.join(dir, 'hires_open_rest_nocap.png'))   // 1024x768 avatar on #050505
    .extend({ top: 128, bottom: 128, left: 0, right: 0, background: '#050505' })  // -> 1024x1024
    .png()
    .toFile(path.join(dir, 'spike_still_1x1.png'));
  console.log('spike_still_1x1.png (1024x1024)');
})();
