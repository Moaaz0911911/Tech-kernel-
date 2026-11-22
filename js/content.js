// Static fun content shared by the site and codme: jokes, facts, glossary, emoji map.
// (Facts, loading lines and glossary entries are translated with t(); jokes are written per language in i18n-main.js.)
import { lang } from './i18n.js';
import { emojify as emojifyShared } from './emoji.js';
import { LOCAL_JOKES } from './i18n-main.js';

const EN_JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs. 🐛',
  'I told my computer I needed a break… it said “No problem, I’ll go to sleep.” 😴',
  'Why did the smartphone need glasses? It lost all its contacts. 👓',
  'There are 10 kinds of people: those who understand binary and those who don’t. 🔢',
  'Why was the computer cold? It left its Windows open. 🪟',
  'Why did the developer go broke? They used up all their cache. 💸',
  'Why did the slideshow cross the road? To get to the other slide. 🛝',
  'My Wi-Fi went down for five minutes, so I talked to my family. They seem like nice people. 📶',
  'What’s a computer’s favourite snack? Microchips! 🍟',
  'Why do Java developers wear glasses? Because they don’t C#. 👓',
  'I’d tell you a UDP joke, but you might not get it. 📦',
  'A SQL query walks into a bar, walks up to two tables and asks: “Can I join you?” 🍺',
  'What did the router say to the doctor? “It hurts when IP.” 🩺',
  'Debugging: being the detective in a crime movie where you are also the culprit. 🕵️',
  'Why are keyboards always tired? They work two shifts. ⌨️',
  'Why did the robot go on vacation? To recharge its batteries. 🔋',
  'How do trees get online? They log in. 🌳',
  'Why did the kernel go to therapy? Too many unresolved interrupts. 🍿',
  'Why did the popcorn kernel get promoted? It always popped up when it was needed. 📈',
  'What do you call a computer that sings? A-Dell. 🎤',
  'Why was the JavaScript file sad? It didn’t know how to `null` its feelings. 🥲',
  '!false — it’s funny because it’s true. ✅',
  'What’s a robot’s favourite type of music? Heavy metal. 🤘',
  'Why did the cookie go to the doctor? It was feeling crumby — and the browser kept clearing it. 🍪',
];
export const JOKES = LOCAL_JOKES[lang]?.length ? LOCAL_JOKES[lang] : EN_JOKES;

export const FACTS = [
  'The first computer “bug” was a real moth, found stuck in Harvard’s Mark II computer in 1947. 🦋',
  'The first website, built by Tim Berners-Lee at CERN, went live in 1991 — and you can still visit it at info.cern.ch. 🌐',
  '“Wi-Fi” doesn’t officially stand for anything. It’s a brand name invented by a marketing agency. 📶',
  'The first webcam watched a coffee pot at Cambridge University, so people knew when it was full. ☕',
  'Email is older than the web: Ray Tomlinson sent the first networked email in 1971 and picked the @ sign. 📧',
  'The Apollo 11 guidance computer had roughly 4 KB of RAM. Your phone has millions of times more. 🚀',
  'The word “robot” comes from the Czech word “robota” (forced labour), from a 1920 play by Karel Čapek. 🤖',
  'The first computer mouse, built by Douglas Engelbart’s team in the 1960s, was made of wood. 🐭',
  'The first YouTube video, “Me at the zoo”, was uploaded on 23 April 2005. It’s 19 seconds long. 🐘',
  'CAPTCHA stands for “Completely Automated Public Turing test to tell Computers and Humans Apart”. 🧩',
  'Bluetooth is named after Harald “Bluetooth” Gormsson, a 10th-century Danish king. 👑',
  'The first text message, sent in 1992, simply said “Merry Christmas”. 🎄',
  'Nintendo was founded in 1889 — as a playing-card company. 🃏',
  'Python is named after Monty Python’s Flying Circus, not the snake. 🐍',
  'The QWERTY keyboard layout was designed for typewriters back in the 1870s. ⌨️',
  'A 1080p screen has 1920 × 1080 = 2,073,600 pixels. Each one is a tiny coloured light. 🟥🟩🟦',
  'IBM’s first hard drive (1956) stored about 5 million characters and was the size of two refrigerators. 🧊',
  'The “save” icon is still a floppy disk, even though most people using it have never touched one. 💾',
];

export const LOADING_LINES = [
  'Microwaving fresh headlines…',
  'Asking the hamsters to run faster… 🐹',
  'Untangling the internet tubes…',
  'Bribing the servers with cookies 🍪…',
  'Shaking the news tree 🌳…',
  'Teaching robots to read 🤖…',
  'Buttering the bytes 🧈…',
  'Turning it off and on again…',
  'Downloading more RAM… (kidding) 😅',
  'Counting kernels: 1, 10, 11, 100… 🔢',
];

export const GLOSSARY = {
  ai: 'AI (Artificial Intelligence) is software that learns patterns from huge piles of examples, so it can recognise things, make predictions or write text. Think: a very fast parrot that read the whole library. 🦜📚',
  llm: 'An LLM (Large Language Model) is an AI trained on tons of text to predict the next word. Do that really, really well and it can chat, summarise and write code. 🧠💬',
  'machine learning': 'Machine learning is how computers learn rules from examples instead of a human typing every rule in by hand. 📈',
  agi: 'AGI (Artificial General Intelligence) is the idea of an AI that can learn and do almost any mental task a human can. It’s a goal people argue about a lot. 🤔',
  api: 'An API is a menu one program offers another: “ask me for X in this format and I’ll give you Y.” Like a waiter between you and the kitchen. 🍽️',
  cpu: 'The CPU is the computer’s brain. It follows instructions — billions of them every second. 🧠',
  gpu: 'A GPU is a chip with thousands of small workers doing maths at the same time. Perfect for games, video and training AI. 🎮',
  ram: 'RAM is short-term memory — the desk where the computer keeps what it’s working on right now. Power off and the desk is wiped clean. 🗒️',
  cloud: 'The cloud is… other people’s computers! Giant data centres you rent over the internet. ☁️🏢',
  blockchain: 'A blockchain is a shared notebook copied across many computers. New pages are chained to old ones so nobody can secretly rewrite history. 📒🔗',
  crypto: 'Crypto (cryptocurrency) is digital money tracked on a blockchain instead of by a bank. Prices can swing wildly! 🪙🎢',
  vpn: 'A VPN builds an encrypted tunnel from your device to a server, so the local network can’t easily peek at what you’re doing. 🚇',
  encryption: 'Encryption scrambles data with a secret key so only someone with the right key can unscramble it. 🔐',
  'open source': 'Open-source software publishes its code so anyone can read it, fix it and improve it. 🧑‍🤝‍🧑',
  algorithm: 'An algorithm is a step-by-step recipe for solving a problem. 🍳',
  bug: 'A bug is a mistake in code that makes a program misbehave. The name got famous in 1947, when engineers found a real moth in a computer. 🐛',
  'quantum computer': 'Quantum computers use qubits, which can hold a blend of 0 and 1 at once. For some special problems that could make them wildly faster. ⚛️',
  '5g': '5G is the fifth generation of mobile networks: faster downloads and less delay than 4G. 📶',
  cookie: 'A cookie is a tiny note a website stores in your browser to remember you — like keeping you logged in. Not the tasty kind. 🍪',
  browser: 'A browser (Chrome, Safari, Firefox…) is the app that fetches web pages and draws them on your screen. 🌐',
  malware: 'Malware is software built to cause harm — viruses, spyware, ransomware and friends. 🦠',
  phishing: 'Phishing is a trick message pretending to be someone you trust, so you hand over a password or money. Don’t take the bait! 🎣',
  ransomware: 'Ransomware locks up your files and demands payment to unlock them. Good backups are the antidote. 💾',
  kernel: 'A kernel is the core of an operating system: it talks to the hardware and shares it fairly between apps. Also what popcorn is before it gets exciting. 🍿',
  wifi: 'Wi-Fi sends internet data through the air as radio waves between your device and a router. 📡',
  robot: 'A robot is a machine that can sense the world, decide what to do and then move or act — like a vacuum that dodges your socks. 🤖',
  deepfake: 'A deepfake is a fake video, photo or voice made by AI to look real. Always check the source! 🎭',
  iot: 'IoT (Internet of Things) means everyday stuff connected to the internet — smart bulbs, fridges, doorbells. 💡',
  chip: 'A chip (semiconductor) is a sliver of silicon packed with billions of microscopic switches called transistors. 🔬',
  startup: 'A startup is a young company trying to grow fast, usually with money from investors. 🚀💰',
  ipo: 'An IPO is when a company first sells its shares on the stock market so anyone can buy a piece. 📈',
  github: 'GitHub is a website where programmers store code, track changes and work on projects together. 🐙',
  linux: 'Linux is a free, open-source operating system. It runs most of the internet’s servers — and Android phones too. 🐧',
  app: 'An app is a program that does a job for you — a game, a calculator, a chat. 📱',
  internet: 'The internet is a giant network of networks: billions of devices passing little packets of data to each other. 🌍',
  password: 'A password is a secret key for your accounts. Long and silly beats short and clever: “PurpleTiger-Eats-42-Tacos!” 🔑',
};

export const GLOSSARY_ALIASES = {
  'artificial intelligence': 'ai', 'a.i': 'ai', 'large language model': 'llm', 'language model': 'llm', llms: 'llm',
  ml: 'machine learning', 'artificial general intelligence': 'agi', apis: 'api', processor: 'cpu', 'graphics card': 'gpu',
  memory: 'ram', 'the cloud': 'cloud', 'cloud computing': 'cloud', cryptocurrency: 'crypto', bitcoin: 'crypto',
  'open-source': 'open source', opensource: 'open source', 'quantum': 'quantum computer', 'quantum computing': 'quantum computer',
  'wi-fi': 'wifi', 'wi fi': 'wifi', cookies: 'cookie', virus: 'malware', semiconductor: 'chip', microchip: 'chip',
  'internet of things': 'iot', apps: 'app', web: 'internet', 'the internet': 'internet', 'a kernel': 'kernel',
};

export function lookupGlossary(term) {
  const t = String(term).toLowerCase().replace(/[?!.]+$/, '').replace(/^(an?|the)\s+/, '').trim();
  const tries = [t, t.replace(/s$/, '')];
  for (const x of tries) {
    if (GLOSSARY[x]) return { term: x, text: GLOSSARY[x] };
    if (GLOSSARY_ALIASES[x]) return { term: GLOSSARY_ALIASES[x], text: GLOSSARY[GLOSSARY_ALIASES[x]] };
  }
  return null;
}

export const emojify = (title) => emojifyShared(title);
