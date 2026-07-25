import fs from 'fs';
import path from 'path';

function getDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (filePath.endsWith('.png')) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] === 0xFF && (buffer[offset+1] === 0xC0 || buffer[offset+1] === 0xC2)) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      offset++;
    }
  }
  return null;
}

const dirs = ['src/assets/hero', 'src/assets/plans', 'src/assets/about'];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  console.log(`\n--- Directory: ${dir} ---`);
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) continue;
    const dim = getDimensions(fullPath);
    if (dim) {
      const ratio = (dim.width / dim.height).toFixed(2);
      console.log(`${file}: ${dim.width}x${dim.height} (Ratio: ${ratio})`);
    }
  }
}
