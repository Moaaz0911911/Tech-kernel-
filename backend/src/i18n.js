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
  duelChallenge: {
    en: '⚔️ @{who} challenged you to a Quiz Duel!',
    ar: '⚔️ @{who} عمل معاك تحدي كويز!',
    de: '⚔️ @{who} fordert dich zum Quiz-Duell heraus!',
    tl: '⚔️ Hinamon ka ni @{who} sa Quiz Duel!',
  },
  duelChallengeBody: {
    en: '5 questions from today’s news. Can you beat @{who}?',
    ar: '5 أسئلة من أخبار النهارده. تقدر تغلب @{who}؟',
    de: '5 Fragen zu den heutigen News. Schlägst du @{who}?',
    tl: '5 tanong mula sa balita ngayon. Kaya mo bang talunin si @{who}?',
  },
  duelTurn: {
    en: '⚔️ @{who} played your duel — your turn!',
    ar: '⚔️ @{who} لعب التحدي — دورك!',
    de: '⚔️ @{who} hat euer Duell gespielt – du bist dran!',
    tl: '⚔️ Nilaro na ni @{who} ang duel ninyo — ikaw na!',
  },
  duelTurnBody: {
    en: 'Open kerNEl to play your 5 questions.',
    ar: 'افتح kerNEl والعب الـ 5 أسئلة بتوعك.',
    de: 'Öffne kerNEl und spiel deine 5 Fragen.',
    tl: 'Buksan ang kerNEl para laruin ang 5 tanong mo.',
  },
  duelResult: {
    en: '⚔️ Your duel with @{who} is over!',
    ar: '⚔️ التحدي بينك وبين @{who} خلص!',
    de: '⚔️ Dein Duell mit @{who} ist vorbei!',
    tl: '⚔️ Tapos na ang duel ninyo ni @{who}!',
  },
  duelResultBody: {
    en: 'See who won.',
    ar: 'شوف مين كسب.',
    de: 'Schau, wer gewonnen hat.',
    tl: 'Tingnan kung sino ang nanalo.',
  },
  liveSoon: {
    en: '📺 kerNEl Live starts in a few minutes!',
    ar: '📺 kerNEl Live هيبدأ كمان كام دقيقة!',
    de: '📺 kerNEl Live startet in ein paar Minuten!',
    tl: '📺 Magsisimula ang kerNEl Live sa ilang minuto!',
  },
  liveSoonBody: {
    en: '10 questions, one wrong answer and you’re out. Join the lobby!',
    ar: '10 أسئلة، وأي إجابة غلط تطلّعك برة. ادخل اللوبي!',
    de: '10 Fragen – eine falsche Antwort und du bist raus. Ab in die Lobby!',
    tl: '10 tanong, isang maling sagot at out ka na. Pumasok na sa lobby!',
  },
  seasonWin: {
    en: '🏅 You finished last month’s season at #{place}!',
    ar: '🏅 خلّصت موسم الشهر اللي فات في المركز #{place}!',
    de: '🏅 Du hast die Saison letzten Monat auf Platz {place} beendet!',
    tl: '🏅 Natapos mo ang season noong nakaraang buwan sa #{place}!',
  },
  seasonWinBody: {
    en: '+{xp} XP and the Season legend frame are yours.',
    ar: '+{xp} XP وإطار أسطورة الموسم بتوعك.',
    de: '+{xp} XP und der Saison-Legende-Rahmen gehören dir.',
    tl: 'Iyo na ang +{xp} XP at ang Season legend frame.',
  },
  inviteJoined: {
    en: '🎟️ @{who} joined kerNEl with your invite!',
    ar: '🎟️ @{who} دخل kerNEl بالدعوة بتاعتك!',
    de: '🎟️ @{who} ist mit deiner Einladung bei kerNEl!',
    tl: '🎟️ Sumali si @{who} sa kerNEl gamit ang invite mo!',
  },
  inviteJoinedBody: {
    en: 'You both got +{xp} XP. Open kerNEl to collect it.',
    ar: 'إنتوا الاتنين خدتوا +{xp} XP. افتح kerNEl عشان تاخدها.',
    de: 'Ihr bekommt beide +{xp} XP. Öffne kerNEl, um sie abzuholen.',
    tl: 'Pareho kayong may +{xp} XP. Buksan ang kerNEl para kunin ito.',
  },
  dmTitle: {
    en: '✉️ @{who} sent you a message',
    ar: '✉️ @{who} بعتلك رسالة',
    de: '✉️ @{who} hat dir geschrieben',
    tl: '✉️ Nag-message sa’yo si @{who}',
  },
  dmRequest: {
    en: '📨 New message request from @{who}',
    ar: '📨 طلب رسالة جديد من @{who}',
    de: '📨 Neue Nachrichtenanfrage von @{who}',
    tl: '📨 Bagong message request mula kay @{who}',
  },
  dmRequestBody: {
    en: 'Open kerNEl to accept or ignore it.',
    ar: 'افتح kerNEl عشان تقبلها أو تتجاهلها.',
    de: 'Öffne kerNEl, um sie anzunehmen oder zu ignorieren.',
    tl: 'Buksan ang kerNEl para tanggapin o i-ignore.',
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
