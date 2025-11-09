const fs = require('node:fs');
const path = require('node:path');

const [, , targetDir = 'dist/assets'] = process.argv;

const projectRoot = process.cwd();
const sourcePath = path.resolve(projectRoot, 'assets', 'config.json');
const targetPath = path.resolve(targetDir, 'config.json');

if(!fs.existsSync(sourcePath)){
  console.error(`Missing source config at ${sourcePath}. Create assets/config.json with the private key.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
console.log(`Copied ${sourcePath} → ${targetPath}`);
