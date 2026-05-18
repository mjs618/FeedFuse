import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function loadEnvFileIfPresent(envFilePath) {
  let content;
  try {
    content = await fs.readFile(envFilePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const assignment = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = assignment.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = assignment.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    const rawValue = assignment.slice(separatorIndex + 1).trim();
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    const withoutComment = quoted ? rawValue : rawValue.split('#')[0].trim();
    process.env[key] = quoted ? rawValue.slice(1, -1) : withoutComment;
  }
}

const karpathyHnFeeds = [
  ['simonwillison.net', 'https://simonwillison.net/atom/everything/', 'https://simonwillison.net'],
  ['jeffgeerling.com', 'https://www.jeffgeerling.com/blog.xml', 'https://jeffgeerling.com'],
  ['seangoedecke.com', 'https://www.seangoedecke.com/rss.xml', 'https://seangoedecke.com'],
  ['krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', 'https://krebsonsecurity.com'],
  ['daringfireball.net', 'https://daringfireball.net/feeds/main', 'https://daringfireball.net'],
  ['ericmigi.com', 'https://ericmigi.com/rss.xml', 'https://ericmigi.com'],
  ['antirez.com', 'http://antirez.com/rss', 'http://antirez.com'],
  ['idiallo.com', 'https://idiallo.com/feed.rss', 'https://idiallo.com'],
  ['maurycyz.com', 'https://maurycyz.com/index.xml', 'https://maurycyz.com'],
  ['pluralistic.net', 'https://pluralistic.net/feed/', 'https://pluralistic.net'],
  ['shkspr.mobi', 'https://shkspr.mobi/blog/feed/', 'https://shkspr.mobi'],
  ['lcamtuf.substack.com', 'https://lcamtuf.substack.com/feed', 'https://lcamtuf.substack.com'],
  ['mitchellh.com', 'https://mitchellh.com/feed.xml', 'https://mitchellh.com'],
  ['dynomight.net', 'https://dynomight.net/feed.xml', 'https://dynomight.net'],
  ['utcc.utoronto.ca/~cks', 'https://utcc.utoronto.ca/~cks/space/blog/?atom', 'https://utcc.utoronto.ca/~cks'],
  ['xeiaso.net', 'https://xeiaso.net/blog.rss', 'https://xeiaso.net'],
  ['devblogs.microsoft.com/oldnewthing', 'https://devblogs.microsoft.com/oldnewthing/feed', 'https://devblogs.microsoft.com/oldnewthing'],
  ['righto.com', 'https://www.righto.com/feeds/posts/default', 'https://righto.com'],
  ['lucumr.pocoo.org', 'https://lucumr.pocoo.org/feed.atom', 'https://lucumr.pocoo.org'],
  ['skyfall.dev', 'https://skyfall.dev/rss.xml', 'https://skyfall.dev'],
  ['garymarcus.substack.com', 'https://garymarcus.substack.com/feed', 'https://garymarcus.substack.com'],
  ['rachelbythebay.com', 'https://rachelbythebay.com/w/atom.xml', 'https://rachelbythebay.com'],
  ['overreacted.io', 'https://overreacted.io/rss.xml', 'https://overreacted.io'],
  ['timsh.org', 'https://timsh.org/rss/', 'https://timsh.org'],
  ['johndcook.com', 'https://www.johndcook.com/blog/feed/', 'https://johndcook.com'],
  ['gilesthomas.com', 'https://gilesthomas.com/feed/rss.xml', 'https://gilesthomas.com'],
  ['matklad.github.io', 'https://matklad.github.io/feed.xml', 'https://matklad.github.io'],
  ['derekthompson.org', 'https://www.theatlantic.com/feed/author/derek-thompson/', 'https://derekthompson.org'],
  ['evanhahn.com', 'https://evanhahn.com/feed.xml', 'https://evanhahn.com'],
  ['terriblesoftware.org', 'https://terriblesoftware.org/feed/', 'https://terriblesoftware.org'],
  ['rakhim.exotext.com', 'https://rakhim.exotext.com/rss.xml', 'https://rakhim.exotext.com'],
  ['joanwestenberg.com', 'https://joanwestenberg.com/rss', 'https://joanwestenberg.com'],
  ['xania.org', 'https://xania.org/feed', 'https://xania.org'],
  ['micahflee.com', 'https://micahflee.com/feed/', 'https://micahflee.com'],
  ['nesbitt.io', 'https://nesbitt.io/feed.xml', 'https://nesbitt.io'],
  ['construction-physics.com', 'https://www.construction-physics.com/feed', 'https://construction-physics.com'],
  ['tedium.co', 'https://feed.tedium.co/', 'https://tedium.co'],
  ['susam.net', 'https://susam.net/feed.xml', 'https://susam.net'],
  ['entropicthoughts.com', 'https://entropicthoughts.com/feed.xml', 'https://entropicthoughts.com'],
  ['buttondown.com/hillelwayne', 'https://buttondown.com/hillelwayne/rss', 'https://buttondown.com/hillelwayne'],
  ['dwarkesh.com', 'https://www.dwarkeshpatel.com/feed', 'https://dwarkesh.com'],
  ['borretti.me', 'https://borretti.me/feed.xml', 'https://borretti.me'],
  ['wheresyoured.at', 'https://www.wheresyoured.at/rss/', 'https://wheresyoured.at'],
  ['jayd.ml', 'https://jayd.ml/feed.xml', 'https://jayd.ml'],
  ['minimaxir.com', 'https://minimaxir.com/index.xml', 'https://minimaxir.com'],
  ['geohot.github.io', 'https://geohot.github.io/blog/feed.xml', 'https://geohot.github.io'],
  ['paulgraham.com', 'http://www.aaronsw.com/2002/feeds/pgessays.rss', 'https://paulgraham.com'],
  ['filfre.net', 'https://www.filfre.net/feed/', 'https://filfre.net'],
  ['blog.jim-nielsen.com', 'https://blog.jim-nielsen.com/feed.xml', 'https://blog.jim-nielsen.com'],
  ['dfarq.homeip.net', 'http://dfarq.homeip.net/feed/', 'https://dfarq.homeip.net'],
  ['jyn.dev', 'https://jyn.dev/atom.xml', 'https://jyn.dev'],
  ['geoffreylitt.com', 'https://www.geoffreylitt.com/feed.xml', 'https://geoffreylitt.com'],
  ['downtowndougbrown.com', 'https://www.downtowndougbrown.com/feed/', 'https://downtowndougbrown.com'],
  ['brutecat.com', 'https://brutecat.com/rss.xml', 'https://brutecat.com'],
  ['eli.thegreenplace.net', 'https://eli.thegreenplace.net/feeds/all.atom.xml', 'https://eli.thegreenplace.net'],
  ['abortretry.fail', 'https://www.abortretry.fail/feed', 'https://abortretry.fail'],
  ['fabiensanglard.net', 'https://fabiensanglard.net/rss.xml', 'https://fabiensanglard.net'],
  ['oldvcr.blogspot.com', 'https://oldvcr.blogspot.com/feeds/posts/default', 'https://oldvcr.blogspot.com'],
  ['bogdanthegeek.github.io', 'https://bogdanthegeek.github.io/blog/index.xml', 'https://bogdanthegeek.github.io'],
  ['hugotunius.se', 'https://hugotunius.se/feed.xml', 'https://hugotunius.se'],
  ['gwern.net', 'https://gwern.substack.com/feed', 'https://gwern.net'],
  ['berthub.eu', 'https://berthub.eu/articles/index.xml', 'https://berthub.eu'],
  ['chadnauseam.com', 'https://chadnauseam.com/rss.xml', 'https://chadnauseam.com'],
  ['simone.org', 'https://simone.org/feed/', 'https://simone.org'],
  ['it-notes.dragas.net', 'https://it-notes.dragas.net/feed/', 'https://it-notes.dragas.net'],
  ['beej.us', 'https://beej.us/blog/rss.xml', 'https://beej.us'],
  ['hey.paris', 'https://hey.paris/index.xml', 'https://hey.paris'],
  ['danielwirtz.com', 'https://danielwirtz.com/rss.xml', 'https://danielwirtz.com'],
  ['matduggan.com', 'https://matduggan.com/rss/', 'https://matduggan.com'],
  ['refactoringenglish.com', 'https://refactoringenglish.com/index.xml', 'https://refactoringenglish.com'],
  ['worksonmymachine.substack.com', 'https://worksonmymachine.substack.com/feed', 'https://worksonmymachine.substack.com'],
  ['philiplaine.com', 'https://philiplaine.com/index.xml', 'https://philiplaine.com'],
  ['steveblank.com', 'https://steveblank.com/feed/', 'https://steveblank.com'],
  ['bernsteinbear.com', 'https://bernsteinbear.com/feed.xml', 'https://bernsteinbear.com'],
  ['danieldelaney.net', 'https://danieldelaney.net/feed', 'https://danieldelaney.net'],
  ['troyhunt.com', 'https://www.troyhunt.com/rss/', 'https://troyhunt.com'],
  ['herman.bearblog.dev', 'https://herman.bearblog.dev/feed/', 'https://herman.bearblog.dev'],
  ['tomrenner.com', 'https://tomrenner.com/index.xml', 'https://tomrenner.com'],
  ['martinalderson.com', 'https://martinalderson.com/feed.xml', 'https://martinalderson.com'],
  ['danielchasehooper.com', 'https://danielchasehooper.com/feed.xml', 'https://danielchasehooper.com'],
  ['chiark.greenend.org.uk/~sgtatham', 'https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/feed.xml', 'https://chiark.greenend.org.uk/~sgtatham'],
  ['grantslatton.com', 'https://grantslatton.com/rss.xml', 'https://grantslatton.com'],
  ['experimental-history.com', 'https://www.experimental-history.com/feed', 'https://experimental-history.com'],
  ['anildash.com', 'https://anildash.com/feed.xml', 'https://anildash.com'],
  ['aresluna.org', 'https://aresluna.org/main.rss', 'https://aresluna.org'],
  ['michael.stapelberg.ch', 'https://michael.stapelberg.ch/feed.xml', 'https://michael.stapelberg.ch'],
  ['miguelgrinberg.com', 'https://blog.miguelgrinberg.com/feed', 'https://miguelgrinberg.com'],
  ['keygen.sh', 'https://keygen.sh/blog/feed.xml', 'https://keygen.sh'],
  ['mjg59.dreamwidth.org', 'https://mjg59.dreamwidth.org/data/rss', 'https://mjg59.dreamwidth.org'],
  ['computer.rip', 'https://computer.rip/rss.xml', 'https://computer.rip'],
].map(([title, url, siteUrl]) => ({ title, url, siteUrl, categoryName: 'Karpathy HN 2025' }));

const aiFeeds = [
  ['OpenAI News', 'https://openai.com/news/rss.xml', 'https://openai.com/news'],
  ['OpenAI Developers', 'https://developers.openai.com/rss.xml', 'https://developers.openai.com'],
  ['Anthropic / Claude News', 'https://news.google.com/rss/search?q=Anthropic%20AI%20OR%20Claude&hl=en-US&gl=US&ceid=US:en', 'https://www.anthropic.com/news'],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'https://deepmind.google/blog'],
  ['Google Research', 'https://research.google/blog/rss/', 'https://research.google/blog'],
  ['Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog'],
  ['Meta AI News', 'https://news.google.com/rss/search?q=Meta%20AI%20OR%20Llama&hl=en-US&gl=US&ceid=US:en', 'https://ai.meta.com/blog'],
  ['Microsoft AI Blog', 'https://blogs.microsoft.com/ai/feed/', 'https://blogs.microsoft.com/ai'],
  ['IBM Research Blog', 'https://research.ibm.com/rss', 'https://research.ibm.com/blog'],
  ['NVIDIA Technical Blog - Deep Learning', 'https://developer.nvidia.com/blog/category/deep-learning/feed/', 'https://developer.nvidia.com/blog/category/deep-learning'],
  ['arXiv cs.AI', 'https://export.arxiv.org/rss/cs.AI', 'https://arxiv.org/list/cs.AI/recent'],
  ['arXiv cs.LG', 'https://export.arxiv.org/rss/cs.LG', 'https://arxiv.org/list/cs.LG/recent'],
  ['arXiv cs.CL', 'https://export.arxiv.org/rss/cs.CL', 'https://arxiv.org/list/cs.CL/recent'],
  ['arXiv cs.CV', 'https://export.arxiv.org/rss/cs.CV', 'https://arxiv.org/list/cs.CV/recent'],
  ['arXiv stat.ML', 'https://export.arxiv.org/rss/stat.ML', 'https://arxiv.org/list/stat.ML/recent'],
  ['BAIR Blog', 'https://bair.berkeley.edu/blog/feed.xml', 'https://bair.berkeley.edu/blog'],
  ['Stanford AI Lab Blog', 'https://ai.stanford.edu/blog/feed.xml', 'https://ai.stanford.edu/blog'],
  ['Stanford HAI News', 'https://news.google.com/rss/search?q=Stanford%20HAI%20artificial%20intelligence&hl=en-US&gl=US&ceid=US:en', 'https://hai.stanford.edu/news'],
  ['MIT Technology Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', 'https://www.technologyreview.com/topic/artificial-intelligence/'],
  ['AIhub', 'https://aihub.org/feed/?cat=-473', 'https://aihub.org'],
  ['The Gradient', 'https://thegradient.pub/rss/', 'https://thegradient.pub'],
  ['Distill', 'https://distill.pub/rss.xml', 'https://distill.pub'],
  ["Lil'Log", 'https://lilianweng.github.io/index.xml', 'https://lilianweng.github.io'],
  ['Chip Huyen', 'https://huyenchip.com/feed.xml', 'https://huyenchip.com'],
  ['Jay Alammar', 'https://jalammar.github.io/feed.xml', 'https://jalammar.github.io'],
  ['Ahead of AI', 'https://magazine.sebastianraschka.com/feed', 'https://magazine.sebastianraschka.com'],
  ['Machine Learning Mastery', 'https://machinelearningmastery.com/feed/', 'https://machinelearningmastery.com'],
  ['Latent Space', 'https://www.latent.space/feed', 'https://www.latent.space'],
  ['Interconnects', 'https://www.interconnects.ai/feed', 'https://www.interconnects.ai'],
  ['Eugene Yan', 'https://eugeneyan.com/rss/', 'https://eugeneyan.com'],
  ['Hamel Husain', 'https://hamel.dev/index.xml', 'https://hamel.dev'],
  ['MLOps News', 'https://news.google.com/rss/search?q=MLOps%20machine%20learning%20operations&hl=en-US&gl=US&ceid=US:en', 'https://home.mlops.community'],
  ['LangChain Blog', 'https://blog.langchain.com/rss.xml', 'https://blog.langchain.com'],
  ['LlamaIndex News', 'https://news.google.com/rss/search?q=LlamaIndex&hl=en-US&gl=US&ceid=US:en', 'https://www.llamaindex.ai/blog'],
  ['EleutherAI Blog', 'https://blog.eleuther.ai/index.xml', 'https://blog.eleuther.ai'],
  ['Cohere News', 'https://news.google.com/rss/search?q=Cohere%20AI&hl=en-US&gl=US&ceid=US:en', 'https://cohere.com/blog'],
  ['Mistral AI News', 'https://news.google.com/rss/search?q=Mistral%20AI&hl=en-US&gl=US&ceid=US:en', 'https://mistral.ai/news'],
  ['Ollama Blog', 'https://ollama.com/blog/rss.xml', 'https://ollama.com/blog'],
].map(([title, url, siteUrl]) => ({ title, url, siteUrl, categoryName: 'AI Top Sources' }));

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildOpml(groups) {
  const outlines = groups.map(({ name, feeds }) => {
    const feedLines = feeds.map((feed) => (
      `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl)}"/>`
    ));
    return [`  <outline text="${escapeXml(name)}" title="${escapeXml(name)}">`, ...feedLines, '  </outline>'].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    ' <head>',
    '  <title>FeedFuse AI Subscriptions</title>',
    ' </head>',
    ' <body>',
    ...outlines,
    ' </body>',
    '</opml>',
    '',
  ].join('\n');
}

function normalizeComparableUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

async function ensureCategory(client, name) {
  const existing = await client.query(
    'select id from categories where lower(btrim(name)) = lower(btrim($1)) limit 1',
    [name],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query(
    `
      insert into categories(name, position)
      values ($1, (select coalesce(max(position), -1) + 1 from categories))
      returning id
    `,
    [name],
  );
  return created.rows[0].id;
}

async function main() {
  await loadEnvFileIfPresent(path.join(rootDir, '.env'));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const groups = [
    { name: 'AI Top Sources', feeds: aiFeeds },
    { name: 'Karpathy HN 2025', feeds: karpathyHnFeeds },
  ];
  const feeds = [...aiFeeds, ...karpathyHnFeeds];
  const seen = new Set();
  const uniqueFeeds = feeds.filter((feed) => {
    const comparableUrl = normalizeComparableUrl(feed.url);
    if (seen.has(comparableUrl)) return false;
    seen.add(comparableUrl);
    return true;
  });

  const opmlPath = path.join(rootDir, 'docs', 'ai-subscriptions.opml');
  await fs.writeFile(opmlPath, buildOpml(groups), 'utf8');

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  let importedCount = 0;
  let duplicateCount = 0;
  try {
    await client.query('begin');
    const categoryIds = new Map();
    for (const group of groups) {
      categoryIds.set(group.name, await ensureCategory(client, group.name));
    }

    for (const feed of uniqueFeeds) {
      const categoryId = categoryIds.get(feed.categoryName);
      const inserted = await client.query(
        `
          insert into feeds(
            title,
            url,
            site_url,
            icon_url,
            enabled,
            category_id,
            fetch_interval_minutes,
            article_list_display_mode,
            full_text_on_open_enabled,
            full_text_on_fetch_enabled
          )
          values ($1, $2, $3, null, true, $4, 60, 'card', true, true)
          on conflict (url) do nothing
          returning id
        `,
        [feed.title, feed.url, feed.siteUrl, categoryId],
      );

      if ((inserted.rowCount ?? 0) > 0) {
        importedCount += 1;
        const feedId = inserted.rows[0].id;
        await client.query(
          "update feeds set icon_url = '/api/feeds/' || id::text || '/favicon' where id = $1 and site_url is not null",
          [feedId],
        );
      } else {
        duplicateCount += 1;
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    opmlPath,
    sourceCount: feeds.length,
    uniqueSourceCount: uniqueFeeds.length,
    importedCount,
    duplicateCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
