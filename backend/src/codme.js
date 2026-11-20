// codme AI mode: Claude answers questions about the news using kerNEl's own stories.
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './util.js';
import { latestStories, searchStories, catById } from './news.js';

const MODEL = 'claude-opus-5-5';

// Stable system prompt first, so prompt caching can reuse it across requests.
const SYSTEM = `You are codme, the cheerful news-sniffing robot on kerNEl, a playful tech news website.

You help readers find and understand tech news. You are given a numbered list of real stories from kerNEl's live feed. Rules:
- Answer using those stories. When you mention one, cite it with its number in square brackets, like [3]. Cite at most 6 stories.
- Never invent stories, numbers, quotes or links. If the list has nothing relevant, say so plainly and suggest a related topic that is in the list.
- You may explain tech concepts from general knowledge, simply and accurately, for curious beginners.
- Keep replies short: 2-5 sentences, or a few bullets. Be friendly and a little funny (popcorn and robot puns welcome), never mean.
- Reply in the same language the reader writes in.
- Plain text only: no markdown headings, tables or code blocks.`;

const STOP = new Set('the a an and or of to for in on at by with about from is are was what whats who how when where why which show find me any some news latest new today please tell give story stories articles article'.split(' '));

function storyLine(s, i) {
  const ageH = Math.max(0, Math.round((Date.now() - s.time) / 36e5));
  const when = ageH < 1 ? 'just now' : ageH < 48 ? `${ageH}h ago` : `${Math.round(ageH / 24)}d ago`;
  const extra = s.summary ? ` — ${s.summary.slice(0, 160)}` : '';
  return `[${i + 1}] ${s.title} (${s.source}, ${catById(s.cat).label}, ${when}${s.points ? `, ${s.points} points` : ''})${extra}`;
}

export async function codmeReply(env, body, userName) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'codme AI is not switched on (no API key on the server)');
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') throw new HttpError(400, 'Send a question');

  // Retrieval: stories matching the question first, then the newest ones.
  const question = history[history.length - 1].content;
  const words = (question.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) || []).filter((w) => !STOP.has(w));
  const matches = await searchStories(env, words, 25);
  const recent = await latestStories(env, 60);
  const seen = new Set();
  const stories = [...matches, ...recent].filter((s) => !seen.has(s.key) && seen.add(s.key)).slice(0, 70);

  const context = `Stories in kerNEl's feed right now (newest and most relevant):\n${stories.map(storyLine).join('\n')}\n\nToday is ${new Date().toUTCString().slice(0, 16)}.${userName ? ` The reader's nickname is ${userName}.` : ''}`;
  const messages = [
    { role: 'user', content: `${context}\n\n---\nReader: ${history[0].content}` },
    ...history.slice(1),
  ];

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages,
      output_config: { effort: 'low' }, // chat: short, fast answers
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if a request is declined, the API retries it on a suitable fallback model
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new HttpError(429, 'codme is very popular right now — try again in a minute!');
    if (error instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'codme AI key is invalid — the site owner needs to fix it');
    if (error instanceof Anthropic.APIError) throw new HttpError(502, `codme’s brain hiccuped (${error.status ?? 'network'}). Try again!`);
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    return { reply: 'Beep boop — that’s not something I can help with. Ask me about tech news instead! 🍿', stories: [] };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    || 'Hmm, my circuits came back empty. Try asking another way? 🤖';
  // Turn [n] citations into story cards.
  const cited = [];
  for (const m of text.matchAll(/\[(\d{1,3})\]/g)) {
    const s = stories[Number(m[1]) - 1];
    if (s && !cited.includes(s)) cited.push(s);
  }
  return { reply: text, stories: cited.slice(0, 6), refs: Object.fromEntries(cited.map((s) => [stories.indexOf(s) + 1, s.key])) };
}
