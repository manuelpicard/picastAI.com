// Attrappe für die Anthropic-Messages-API (nur für den lokalen Trockenlauf).
// Sie antwortet mit festen Texten im erwarteten Tool-Format und ruft nichts nach außen auf.
// Start: node deploy/dryrun/mock-anthropic.mjs   (Port: MOCK_PORT, Standard 8099)
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 8099);
const delayMs = Number(process.env.MOCK_DELAY_MS || 0);

const ANSWER = {
  category: 'frage',
  speech:
    'Der Himmel wirkt blau, weil das Sonnenlicht in der Luft gestreut wird. ' +
    'Blaues Licht wird dabei stärker gestreut als rotes. Deshalb sehen wir oben Blau.',
};
const STORY = {
  text:
    'Ritter Kunibert stand früh auf und putzte seinen Helm, bis er in der Morgensonne blitzte. ' +
    'Unten im Gasthaus duftete es nach warmer Suppe. Der Kutscher wartete schon vor der Tür.',
  summary: 'Kunibert bricht am Morgen auf.',
  open_threads: 'Wohin fährt der Kutscher?',
  next_hook: 'Der Kutscher kennt einen Weg über den Berg.',
  episode_finished: false,
};

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      setTimeout(() => {
        if (req.method !== 'POST' || req.url !== '/v1/messages') {
          res.writeHead(404).end();
          return;
        }
        let tool = '';
        try {
          tool = JSON.parse(raw).tools?.[0]?.name ?? '';
        } catch {
          // ungültiger Body: wie eine Frage behandeln
        }
        const input = tool === 'kunibert_geschichte' ? STORY : ANSWER;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'tool_use', name: tool, input }] }));
      }, delayMs);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`Attrappe läuft auf http://127.0.0.1:${port}`));
