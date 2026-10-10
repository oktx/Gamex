#!/usr/bin/env node
/* Bundles the game into one self-contained HTML file: dist/contingency.html. Run: node build.js */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = ['util.js', 'data.js', 'cases.js', 'firm.js', 'ui.js', 'main.js'].map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
const body = `<div id="app"></div>
<div id="drawer-root" hidden></div>
<div id="modal-root" class="modal-root" hidden></div>
<div id="toast" class="toast" hidden></div>`;
const head = `<title>Contingency</title>
<meta name="description" content="A personal injury law firm tycoon. Run every case from intake to disbursement and grow from a solo practice into a dynasty.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
${css}
</style>`;
const script = `<script>
${js.replace(/<\/script>/g, '<\\/script>')}
</script>`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'contingency.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
${script}
</body>
</html>
`);
// Fragment without the document skeleton, for hosts that wrap the page themselves.
const out = process.argv[2];
if (out) fs.writeFileSync(out, `${head}\n${body}\n${script}\n`);
console.log('Wrote dist/contingency.html' + (out ? ' and ' + out : ''));
