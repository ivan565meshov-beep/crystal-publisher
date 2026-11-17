// читает .env без лишних библиотек; комментарии после « #» в конце строки отбрасываются
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m || process.env[m[1]]) continue;
  const v = m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  process.env[m[1]] = v;
}
