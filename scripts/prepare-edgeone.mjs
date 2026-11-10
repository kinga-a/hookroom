import { access, readFile } from 'node:fs/promises';

const required = [
  'public/index.html',
  'public/app.js',
  'public/styles.css',
  'cloud-functions/api/[[default]].js',
  'cloud-functions/hook/[[default]].js',
  'cloud-functions/mcp.js',
];

for (const file of required) {
  await access(file);
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (!pkg.dependencies?.['@edgeone/pages-blob']) {
  throw new Error('缺少 @edgeone/pages-blob 依赖，请先执行 npm install');
}
if (!pkg.dependencies?.nodemailer) {
  throw new Error('缺少 nodemailer 依赖，请先执行 npm install');
}

console.log('Hookroom EdgeOne 资源检查通过：public/ + cloud-functions/');
