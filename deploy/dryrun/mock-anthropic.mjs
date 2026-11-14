// Attrappe für die Anthropic-Messages-API (nur für den lokalen Trockenlauf).
// Sie antwortet mit festen Texten im erwarteten Tool-Format und ruft nichts nach außen auf.
// Start: node deploy/dryrun/mock-anthropic.mjs   (Port: MOCK_PORT, Standard 8099)
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 8099);
const delayMs = Number(process.env.MOCK_DELAY_MS || 0);
// Für Messungen (deploy/dryrun/strom-messung.mjs): So lange "schreibt" die Attrappe an einer Antwort,
// gleichmäßig verteilt (wie Claude Token für Token). Ohne Streaming kommt die Antwort erst danach.
const writeMs = Number(process.env.MOCK_WRITE_MS || 0);
const longStory = process.env.MOCK_LONG_STORY === '1';

const ANSWER = {
  category: 'frage',
  speech:
    'Der Himmel wirkt blau, weil das Sonnenlicht in der Luft gestreut wird. ' +
    'Blaues Licht wird dabei stärker gestreut als rotes. Deshalb sehen wir oben Blau.',
};
const STORY = {
  episode_plan: 'Kunibert will heute herausfinden, wann der Drache schläft.',
  text:
    'Ritter Kunibert stand früh auf und putzte seinen Helm, bis er in der Morgensonne blitzte.\n\n' +
    'Unten im Gasthaus duftete es nach warmer Suppe. Der Kutscher wartete schon vor der Tür.',
  summary: 'Kunibert bricht am Morgen auf.',
  open_threads: 'Wohin fährt der Kutscher?',
  next_hook: 'Der Kutscher kennt einen Weg über den Berg.',
  episode_finished: false,
};

// Ein Teil in der Länge echter Teile (rund 210 Wörter, fünf Absätze), für Messungen.
const LONG_STORY = {
  episode_plan:
    'Kunibert will heute herausfinden, wann der Drache schläft. Nebenfigur: Schäferin Mila mit der roten Mütze. ' +
    'Die Hexe sagt: „Wer leise ist, hört den Berg atmen.“ Lösung: Kunibert lauscht am Felsen und wartet, bis das Schnaufen langsam wird.',
  text: [
    'Kunibert erwachte im Dachzimmer, als die Fensterläden klapperten. Draußen grollte es vom Berg herüber.',
    'Der Drache hatte in der Nacht wieder gebrüllt. Kunibert setzte sich auf und rieb sich die Augen. „Heute finde ich heraus, wann er schläft“, murmelte er.',
    'Unten in der Gaststube roch es nach frischem Brot. Die Wirtin stellte ihm eine Schale warmen Brei hin. „Iss, Herr Ritter“, sagte sie. „Mit leerem Bauch ist niemand mutig.“ Kunibert aß alles auf und legte zwei Münzen auf den Tisch.',
    'An der steinernen Brücke wartete schon der Kutscher. „Steig auf“, brummte er. Die Räder holperten über das grobe Pflaster. Kuniberts Helm wackelte bei jedem Stein, und einmal rutschte er ihm fast über die Nase. Der Kutscher lachte leise in seinen Bart.',
    'Am Waldrand stand ein Mädchen mit einer roten Mütze. „Ich bin Mila“, sagte sie. „Meine Schafe sind vor dem Schatten des Drachen in den Wald gelaufen.“ Kunibert nickte ernst. „Dann suchen wir sie zusammen“, sagte er, „und danach gehe ich zum Berg.“',
    'Zwischen den dunklen Tannen wurde es still. Nur ein Specht klopfte irgendwo. Dann sahen sie zwischen den Bäumen ein kleines Haus mit blauem Rauch. Dort wohnte die Hexe. Kunibert atmete tief durch und klopfte an die Tür.',
  ].join('\n\n'),
  summary: 'Kunibert will herausfinden, wann der Drache schläft. Mit der Schäferin Mila sucht er ihre Schafe und steht vor dem Haus der Hexe.',
  open_threads: 'Milas Schafe finden; herausfinden, wann der Drache schläft.',
  next_hook: 'Kunibert klopft an die Tür der Hexe.',
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
        let stream = false;
        try {
          const body = JSON.parse(raw);
          tool = body.tools?.[0]?.name ?? '';
          stream = body.stream === true;
        } catch {
          // ungültiger Body: wie eine Frage behandeln
        }
        const input = tool === 'kunibert_geschichte' ? (longStory ? LONG_STORY : STORY) : ANSWER;
        const usage = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
        if (!stream) {
          setTimeout(() => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ content: [{ type: 'tool_use', name: tool, input }], usage }));
          }, writeMs);
          return;
        }
        // Streaming wie die echte API (Server-Sent Events): die Werkzeug-Eingabe in kleinen Stücken.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        send({ type: 'message_start', message: { usage: { ...usage, output_tokens: 1 } } });
        send({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: tool, input: {} } });
        const json = JSON.stringify(input);
        const pieces = [];
        for (let i = 0; i < json.length; i += 24) pieces.push(json.slice(i, i + 24));
        const step = pieces.length ? writeMs / pieces.length : 0;
        let index = 0;
        const next = () => {
          if (index < pieces.length) {
            send({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: pieces[index++] } });
            if (step > 0) setTimeout(next, step); else next();
            return;
          }
          send({ type: 'content_block_stop', index: 0 });
          send({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: usage.output_tokens } });
          send({ type: 'message_stop' });
          res.end();
        };
        next();
      }, delayMs);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`Attrappe läuft auf http://127.0.0.1:${port}`));
