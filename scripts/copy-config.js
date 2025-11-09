import fs from 'node:fs';
import path from 'node:path';

const [, , targetDir = 'dist/assets'] = process.argv;

const projectRoot = process.cwd();
const sourcePath = path.resolve(projectRoot, 'assets', 'config.json');
const targetPath = path.resolve(targetDir, 'config.json');

function fail(msg){
  console.error(msg);
  process.exit(1);
}

if(!fs.existsSync(sourcePath)){
  fail(`Missing source config at ${sourcePath}. Create assets/config.json with the private key.`);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
console.log(`Copied ${sourcePath} → ${targetPath}`);
