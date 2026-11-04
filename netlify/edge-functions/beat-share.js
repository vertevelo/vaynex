/* Share link for a single beat: /beats/<id>/ (also /de/, /it/, /fr/) serves the Beat Store page with the beat's
   cover, name and BPM in the link preview, and store.js opens the store on that beat.
   Messengers never send the #fragment to the server, so /beats/#id always showed the portrait.
   The beat comes from the same beats.json the store reads, so a new beat or cover needs no deploy. */

const CATALOG = 'https://vaynex.b-cdn.net/store/beats.json';
const SITE = 'https://www.vaynex.ch';

// No dashes, no ? ! : ; (French would need a non-breaking space before them)
const TEXT = {
  en: {
    kind: mood => mood ? `${mood} beat by Vaynex` : 'Hand-made beat by Vaynex',
    available: 'Exclusive license, sold only once. Listen to the preview.',
    reserved: 'Reserved right now, every beat is sold only once.',
    sold: 'Sold exclusively, more beats in the store.',
    cover: 'cover'
  },
  de: {
    kind: mood => mood ? `${mood}-Beat von Vaynex` : 'Handgemachter Beat von Vaynex',
    available: 'Exklusivlizenz, wird nur einmal verkauft. Hör in die Vorschau rein.',
    reserved: 'Gerade reserviert, jeder Beat wird nur einmal verkauft.',
    sold: 'Exklusiv verkauft, weitere Beats im Store.',
    cover: 'Cover'
  },
  it: {
    kind: mood => mood ? `Beat ${mood} di Vaynex` : 'Beat fatto a mano di Vaynex',
    available: 'Licenza esclusiva, venduto una sola volta. Ascolta l’anteprima.',
    reserved: 'Al momento riservato, ogni beat si vende una sola volta.',
    sold: 'Venduto in esclusiva, altri beat nello store.',
    cover: 'copertina'
  },
  fr: {
    kind: mood => mood ? `Beat ${mood} de Vaynex` : 'Beat fait main par Vaynex',
    available: 'Licence exclusive, vendu une seule fois. Écoute l’extrait.',
    reserved: 'Réservé en ce moment, chaque beat n’est vendu qu’une fois.',
    sold: 'Vendu en exclusivité, d’autres beats dans le store.',
    cover: 'pochette'
  }
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Keep the catalog for a minute per edge instance, the app republishes it on every "Live stellen"
let cached = { at: 0, data: null };
async function catalog() {
  if (cached.data && Date.now() - cached.at < 60e3) return cached.data;
  const r = await fetch(CATALOG);
  if (!r.ok) throw new Error('catalog HTTP ' + r.status);
  cached = { at: Date.now(), data: await r.json() };
  return cached.data;
}

function shareHead(beat, lang, beatPath) {
  const T = TEXT[lang];
  const status = ['available', 'reserved', 'sold'].includes(beat.status) ? beat.status : 'available';
  const bpm = Math.round(+beat.bpm || 0);
  const title = [beat.name, bpm ? bpm + ' BPM' : '', 'Vaynex'].filter(Boolean).join(' · ');
  const desc = `${T.kind(beat.mood)}. ${T[status]}`;
  const url = SITE + beatPath;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="music.song" />`,
    `<meta property="og:site_name" content="Vaynex" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`
  ];
  if (beat.cover) {
    const img = new URL(beat.cover, CATALOG).href;
    tags.push(
      `<meta property="og:image" content="${esc(img)}" />`,
      `<meta property="og:image:width" content="600" />`,
      `<meta property="og:image:height" content="600" />`,
      `<meta property="og:image:alt" content="${esc(beat.name + ' ' + T.cover)}" />`,
      `<meta name="twitter:image" content="${esc(img)}" />`);
  } else {
    tags.push(`<meta property="og:image" content="${SITE}/images/portrait.jpg" />`);
  }
  return tags.map(t => '  ' + t).join('\n');
}

export default async (request) => {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/(?:(de|it|fr)\/)?beats\/([a-z0-9-]+)\/?$/);
  if (!m) return;
  const lang = m[1] || 'en';
  const store = m[1] ? `/${m[1]}/beats/` : '/beats/';
  const id = m[2];

  let beat;
  try {
    beat = ((await catalog()).beats || []).find(b => b.id === id);
  } catch {
    // Catalog unreachable: the store finds the beat itself from the hash
    return Response.redirect(new URL(store + '#' + id, url), 302);
  }
  // Beat no longer in the store (e.g. hidden after a sale): land on the store
  if (!beat) return Response.redirect(new URL(store, url), 302);

  const page = await fetch(new URL(store, url));
  if (!page.ok) return Response.redirect(new URL(store + '#' + id, url), 302);
  const beatPath = store + id + '/';
  let html = await page.text();
  // Drop the store's own title, description, canonical, Open Graph and Twitter tags, put the beat's in their place
  html = html
    .replace(/^\s*<title>[^<]*<\/title>\s*\n/m, '')
    .replace(/^\s*<meta (?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>\s*\n/gm, '')
    .replace(/^\s*<link rel="canonical"[^>]*>\s*\n/m, '')
    .replace(/(<meta name="viewport"[^>]*>\s*\n)/, `$1${shareHead(beat, lang, beatPath)}\n`)
    // Language switch and hreflang stay on this beat
    .replace(/href="((?:https:\/\/www\.vaynex\.ch)?\/(?:(?:de|it|fr)\/)?beats\/)"/g, `href="$1${id}/"`);

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=0, must-revalidate'
    }
  });
};

export const config = {
  path: ['/beats/*', '/de/beats/*', '/it/beats/*', '/fr/beats/*'],
  excludedPath: ['/beats/', '/de/beats/', '/it/beats/', '/fr/beats/', '/beats/*.js', '/beats/*.css']
};
