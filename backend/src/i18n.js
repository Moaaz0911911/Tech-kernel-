// Words the server itself sends to people: push notifications, inbox items and codme's chat replies.
// Everything else on the website is translated in the browser (js/i18n.js).
export const LANGS = ['en', 'ar', 'de', 'tl'];
export const cleanLang = (l) => (LANGS.includes(l) ? l : 'en');
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export const langOfProfile = (profileJson) => cleanLang(parse(profileJson, {}).lang);

const T = {
  mention: {
    en: '💬 @{who} mentioned you in #{room}',
    ar: '💬 @{who} عملك منشن في #{room}',
    de: '💬 @{who} hat dich in #{room} erwähnt',
    tl: '💬 Binanggit ka ni @{who} sa #{room}',
  },
  commentMention: {
    en: '🗨️ @{who} mentioned you in a comment',
    ar: '🗨️ @{who} عملك منشن في كومنت',
    de: '🗨️ @{who} hat dich in einem Kommentar erwähnt',
    tl: '🗨️ Binanggit ka ni @{who} sa isang comment',
  },
  bigNews: { en: '🔥 Big news', ar: '🔥 خبر جامد', de: '🔥 Große News', tl: '🔥 Malaking balita' },
  bigNewsTopics: {
    en: '🔥 Big news in your topics',
    ar: '🔥 خبر جامد في المواضيع اللي بتحبها',
    de: '🔥 Große News in deinen Themen',
    tl: '🔥 Malaking balita sa mga paborito mong topic',
  },
  streakTitle: {
    en: '🔥 Keep your {n}-day streak alive!',
    ar: '🔥 حافظ على السلسلة بتاعتك ({n} يوم)!',
    de: '🔥 Rette deine {n}-Tage-Serie!',
    tl: '🔥 Ituloy ang {n}-araw mong streak!',
  },
  streakBody: {
    en: 'Pop in today — the Daily Quiz, the Popcorn Battle and the Hot Take are waiting! 🍿',
    ar: 'خش النهارده — كويز اليوم وخناقة الفشار والسؤال الساخن مستنيينك! 🍿',
    de: 'Schau heute vorbei – Tagesquiz, Popcorn-Battle und Hot Take warten auf dich! 🍿',
    tl: 'Dumaan ka ngayon — naghihintay ang Daily Quiz, Popcorn Battle at Hot Take! 🍿',
  },
  testTitle: { en: '🍿 Notifications are on!', ar: '🍿 الإشعارات اشتغلت!', de: '🍿 Benachrichtigungen sind an!', tl: '🍿 Naka-on na ang notifications!' },
  testBody: {
    en: 'kerNEl will ping you for mentions, big news, friends and your streak.',
    ar: 'kerNEl هيبعتلك لما حد يعملك منشن، أو يحصل خبر جامد، أو صحابك يعملوا حاجة، أو السلسلة بتاعتك تقرب تقع.',
    de: 'kerNEl meldet sich bei Erwähnungen, großen News, Freunden und deiner Serie.',
    tl: 'Pi-pingin ka ng kerNEl para sa mentions, malalaking balita, mga kaibigan at streak mo.',
  },
  followTitle: {
    en: '👋 @{who} started following you',
    ar: '👋 @{who} عملك فولو',
    de: '👋 @{who} folgt dir jetzt',
    tl: '👋 Fina-follow ka na ni @{who}',
  },
  followBody: {
    en: 'Follow them back and cheer each other on! 🍿',
    ar: 'رجّعله الفولو وشجعوا بعض! 🍿',
    de: 'Folg zurück und feuert euch gegenseitig an! 🍿',
    tl: 'I-follow mo rin siya pabalik at mag-cheer kayo sa isa’t isa! 🍿',
  },
  friendRank: {
    en: '{emoji} @{who} hit {rank}!',
    ar: '{emoji} @{who} وصل لرتبة {rank}!',
    de: '{emoji} @{who} ist jetzt {rank}!',
    tl: '{emoji} Naging {rank} na si @{who}!',
  },
  friendRankBody: {
    en: 'Your friend is popping off. Send a 🔥 in chat!',
    ar: 'صاحبك مولّعها. ابعتله 🔥 في الشات!',
    de: 'Dein Freund legt richtig los. Schick ein 🔥 im Chat!',
    tl: 'Umaariba ang kaibigan mo. Magpadala ng 🔥 sa chat!',
  },
  friendStreak: {
    en: '🔥 @{who} is on a {n}-day streak!',
    ar: '🔥 @{who} بقاله {n} يوم ورا بعض!',
    de: '🔥 @{who} hat eine {n}-Tage-Serie!',
    tl: '🔥 {n} araw nang sunod-sunod si @{who}!',
  },
  friendStreakBody: {
    en: 'Can you keep up? 👀',
    ar: 'تقدر تجاريه؟ 👀',
    de: 'Kannst du mithalten? 👀',
    tl: 'Kaya mo bang sumabay? 👀',
  },
  trophyTitle: {
    en: '🏆 You placed #{place} in the Real or Fake? tournament!',
    ar: '🏆 جيت المركز #{place} في بطولة حقيقي ولا فيك؟!',
    de: '🏆 Platz {place} im Echt-oder-Fake?-Turnier!',
    tl: '🏆 Ika-{place} ka sa Real or Fake? tournament!',
  },
  trophyBody: {
    en: 'Your trophy is on your profile card, and you unlocked the Champion look. 🍿',
    ar: 'الكاس بقى على بروفايلك، وفتحت لوك البطل. 🍿',
    de: 'Dein Pokal ist auf deiner Profilkarte – und der Champion-Look ist freigeschaltet. 🍿',
    tl: 'Nasa profile card mo na ang trophy, at na-unlock mo ang Champion look. 🍿',
  },
  botHello: {
    en: 'Hi {name}! 👋 Ask me like “@codme rust news” and I’ll sniff out stories for the whole room.',
    ar: 'أهلاً يا {name}! 👋 اسألني كده: “@codme rust news” وأنا أدورلكم على أخبار للأوضة كلها.',
    de: 'Hi {name}! 👋 Frag mich zum Beispiel „@codme rust news“ und ich schnüffle Storys für den ganzen Raum raus.',
    tl: 'Hi {name}! 👋 Tanungin mo ako ng “@codme rust news” at hahanapan ko ng balita ang buong room.',
  },
  botFound: {
    en: '🐽 Here’s what I sniffed out about “{q}”, {name}:',
    ar: '🐽 دي الحاجات اللي لقيتها عن “{q}” يا {name}:',
    de: '🐽 Das hab ich zu „{q}“ erschnüffelt, {name}:',
    tl: '🐽 Heto ang nasinghot ko tungkol sa “{q}”, {name}:',
  },
  botNone: {
    en: 'I sniffed everywhere for “{q}”… nothing in today’s feed. 🍿 Try another word?',
    ar: 'دورت في كل حتة على “{q}”… مفيش حاجة في أخبار النهارده. 🍿 جرب كلمة تانية؟',
    de: 'Ich hab überall nach „{q}“ geschnüffelt … heute nichts im Feed. 🍿 Probier ein anderes Wort?',
    tl: 'Hinanap ko na kahit saan ang “{q}”… wala sa feed ngayon. 🍿 Subukan ang ibang salita?',
  },
};

export const RANK_NAMES = {
  en: ['Unpopped Kernel', 'Warm Kernel', 'Sizzling Kernel', 'Freshly Popped', 'Butter Baron', 'Popcorn Overlord', 'Galactic Snack Deity'],
  ar: ['حباية لسه ما فرقعتش', 'حباية سخنة', 'حباية بتطشطش', 'فشار طازة', 'بارون الزبدة', 'زعيم الفشار', 'إله السناكس المجرّي'],
  de: ['Ungepoppter Kern', 'Warmer Kern', 'Brutzelnder Kern', 'Frisch gepoppt', 'Butter-Baron', 'Popcorn-Overlord', 'Galaktische Snack-Gottheit'],
  tl: ['Hindi Pa Pumuputok', 'Mainit-init na Kernel', 'Sumisirit na Kernel', 'Bagong Putok', 'Baron ng Mantikilya', 'Hari ng Popcorn', 'Diyos ng Galactic Snacks'],
};

/** Translate one server message. */
export function tr(lang, key, vars = {}) {
  const row = T[key] || {};
  const s = row[cleanLang(lang)] || row.en || key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
