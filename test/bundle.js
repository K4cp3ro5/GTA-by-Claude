"use strict";
/* Skleja index.html + js/*.js w jeden samodzielny plik HTML (biblioteki nadal z CDN).
   Użycie: node test/bundle.js [plik_wyjściowy]   (domyślnie gta-by-claude-single.html) */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="js\/([\w.-]+)"><\/script>/g, (m, f) => {
  const src = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(f + ' zawiera </script>');
  return '<script>\n/* ===== js/' + f + ' ===== */\n' + src + '\n</script>';
});
const out = process.argv[2] || path.join(root, 'gta-by-claude-single.html');
fs.writeFileSync(out, html);
console.log('zapisano', out, (html.length/1024).toFixed(0) + ' KB');
