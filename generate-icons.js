import sharp from 'sharp';

// One full sine cycle, white→green gradient, on a dark rounded-square background.
// Control points calculated for smooth bezier sine approximation:
// half-period = 48px, cp offset = 0.36 × half-period ≈ 17px from endpoints
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#4ade80"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="22" fill="#111111"/>
  <path d="M 16,64 C 36,36 52,36 64,64 C 76,92 92,92 112,64"
        stroke="url(#g)" stroke-width="10" stroke-linecap="round" fill="none"/>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(128, 128).png().toFile('icons/icon128.png');
await sharp(buf).resize(48,  48 ).png().toFile('icons/icon48.png');

console.log('✓ icons/icon128.png');
console.log('✓ icons/icon48.png');
