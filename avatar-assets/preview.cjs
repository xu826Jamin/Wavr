const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'spike');

async function corner(file) {
  const { data, info } = await sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 4; return [data[i], data[i+1], data[i+2], data[i+3]]; };
  console.log(file, 'TL', px(2,2), 'TR', px(info.width-3,2), 'BL', px(2,info.height-3));
}

async function over(file, out, bg) {
  await sharp(path.join(dir, file))
    .flatten({ background: bg })
    .resize(600)
    .png()
    .toFile(path.join(dir, out));
}

(async () => {
  await corner('A_openpalm_z.png');
  await corner('B_fist_z.png');
  await over('A_openpalm_cutout.png', 'A_on_frame.png', '#050505');
  await over('B_fist_cutout.png', 'B_on_frame.png', '#050505');
  console.log('previews written');
})();
