// 🃏 kerNEl Cards: the collectible card set (shared with the kerNEl server, which deals the packs).
export const RARITIES = [
  { id: 'common', weight: 58, label: 'Common' },
  { id: 'rare', weight: 28, label: 'Rare' },
  { id: 'epic', weight: 11, label: 'Epic' },
  { id: 'legendary', weight: 3, label: 'Legendary' },
];

export const CARD_SETS = [
  { id: 'retro', emoji: '🕹️', name: 'Retro Gadgets' },
  { id: 'space', emoji: '🚀', name: 'Space Tech' },
  { id: 'robots', emoji: '🤖', name: 'AI & Robots' },
  { id: 'legends', emoji: '💻', name: 'Code Legends' },
];

export const CARDS = [
  { id: 'floppy', set: 'retro', emoji: '💾', rarity: 'common', name: 'Floppy Disk', fact: 'A 3.5-inch floppy held 1.44 MB — less than one phone photo.' },
  { id: 'cartridge', set: 'retro', emoji: '🎮', rarity: 'common', name: 'Game Cartridge', fact: 'Blowing into cartridges never really fixed them. Everyone did it anyway.' },
  { id: 'cassette', set: 'retro', emoji: '📼', rarity: 'common', name: 'Cassette Tape', fact: 'Tapes were rewound with a pencil to save the player’s batteries.' },
  { id: 'modem', set: 'retro', emoji: '📞', rarity: 'rare', name: 'Dial-up Modem', fact: 'Dial-up screeched because two modems were working out how to talk.' },
  { id: 'crt', set: 'retro', emoji: '🖥️', rarity: 'common', name: 'CRT Monitor', fact: 'Old CRT screens drew the picture with a beam of electrons, line by line.' },
  { id: 'pager', set: 'retro', emoji: '📟', rarity: 'rare', name: 'Pager', fact: 'Pagers could only show numbers, so people sent codes like 143 for “I love you”.' },
  { id: 'calcwatch', set: 'retro', emoji: '⌚', rarity: 'epic', name: 'Calculator Watch', fact: 'In the 1980s the coolest smartwatch was a calculator on your wrist.' },
  { id: 'joystick', set: 'retro', emoji: '🕹️', rarity: 'common', name: 'Joystick', fact: 'The word “joystick” is older than video games — pilots used it first.' },
  { id: 'cdrom', set: 'retro', emoji: '💿', rarity: 'legendary', name: 'CD-ROM', fact: 'One CD-ROM held as much as about 450 floppy disks.' },
  { id: 'rocket', set: 'space', emoji: '🚀', rarity: 'common', name: 'Reusable Rocket', fact: 'Some rockets now land back on their feet so they can fly again.' },
  { id: 'satellite', set: 'space', emoji: '🛰️', rarity: 'common', name: 'Satellite', fact: 'Thousands of satellites circle Earth, helping with maps, weather and TV.' },
  { id: 'moonrover', set: 'space', emoji: '🌙', rarity: 'rare', name: 'Moon Rover', fact: 'Astronauts once drove a battery-powered buggy on the Moon.' },
  { id: 'marsrover', set: 'space', emoji: '🔴', rarity: 'epic', name: 'Mars Rover', fact: 'Messages to a Mars rover can take over 20 minutes to arrive.' },
  { id: 'telescope', set: 'space', emoji: '🔭', rarity: 'rare', name: 'Space Telescope', fact: 'Space telescopes see light that left distant galaxies billions of years ago.' },
  { id: 'station', set: 'space', emoji: '🛸', rarity: 'common', name: 'Space Station', fact: 'A space station circles Earth about every 90 minutes.' },
  { id: 'astronaut', set: 'space', emoji: '🧑‍🚀', rarity: 'common', name: 'Astronaut Suit', fact: 'A spacesuit is like a tiny spaceship shaped like a person.' },
  { id: 'comet', set: 'space', emoji: '☄️', rarity: 'rare', name: 'Comet Probe', fact: 'A probe once landed on a comet hurtling through space.' },
  { id: 'blackhole', set: 'space', emoji: '🕳️', rarity: 'legendary', name: 'Black Hole Photo', fact: 'Telescopes all over Earth worked together to photograph a black hole.' },
  { id: 'robodog', set: 'robots', emoji: '🐕', rarity: 'rare', name: 'Robot Dog', fact: 'Four-legged robots can climb stairs and get back up when pushed.' },
  { id: 'chatbot', set: 'robots', emoji: '💬', rarity: 'common', name: 'Chatbot', fact: 'One of the first chatbots, from the 1960s, pretended to be a therapist.' },
  { id: 'neural', set: 'robots', emoji: '🧠', rarity: 'epic', name: 'Neural Network', fact: 'Neural networks learn by tweaking millions of tiny numbers.' },
  { id: 'selfdrive', set: 'robots', emoji: '🚗', rarity: 'rare', name: 'Self-driving Car', fact: 'Self-driving cars “see” with cameras, radar and laser scanners.' },
  { id: 'drone', set: 'robots', emoji: '🚁', rarity: 'common', name: 'Drone', fact: 'Drones keep steady by adjusting their propellers hundreds of times a second.' },
  { id: 'robotarm', set: 'robots', emoji: '🦾', rarity: 'common', name: 'Robot Arm', fact: 'Factory robot arms can repeat the same move millions of times.' },
  { id: 'speaker', set: 'robots', emoji: '🔊', rarity: 'common', name: 'Smart Speaker', fact: 'Smart speakers wait for a wake word before they really start listening.' },
  { id: 'aiart', set: 'robots', emoji: '🎨', rarity: 'rare', name: 'AI Art', fact: 'Image AIs learn to paint by removing noise from a picture, step by step.' },
  { id: 'supercomputer', set: 'robots', emoji: '🏢', rarity: 'legendary', name: 'Supercomputer', fact: 'The fastest computers fill whole rooms and need their own cooling plants.' },
  { id: 'bug', set: 'legends', emoji: '🐛', rarity: 'epic', name: 'The First Bug', fact: 'In 1947 a real moth got stuck in a computer — the first actual “bug”.' },
  { id: 'helloworld', set: 'legends', emoji: '👋', rarity: 'common', name: 'Hello, World!', fact: 'Most programmers’ very first program just prints “Hello, World!”.' },
  { id: 'opensource', set: 'legends', emoji: '🔓', rarity: 'common', name: 'Open Source', fact: 'Open-source code is free for anyone to read, change and share.' },
  { id: 'cloud', set: 'legends', emoji: '☁️', rarity: 'common', name: 'The Cloud', fact: '“The cloud” is just other people’s computers in giant buildings.' },
  { id: 'emoji', set: 'legends', emoji: '😀', rarity: 'rare', name: 'Emoji', fact: 'The first emoji set, made in 1999 in Japan, had 176 tiny pictures.' },
  { id: 'web', set: 'legends', emoji: '🕸️', rarity: 'rare', name: 'The Web', fact: 'The very first website went online in 1991 and is still there.' },
  { id: 'wifi', set: 'legends', emoji: '📶', rarity: 'common', name: 'Wi-Fi', fact: 'Wi-Fi sends data using radio waves, like a tiny radio station.' },
  { id: 'blockchain', set: 'legends', emoji: '⛓️', rarity: 'rare', name: 'Blockchain', fact: 'A blockchain is a shared notebook that many computers keep copies of.' },
  { id: 'mouse', set: 'legends', emoji: '🖱️', rarity: 'legendary', name: 'The Mouse', fact: 'The computer mouse was first shown to the world in 1968, made of wood.' },
];

export const cardById = (id) => CARDS.find((c) => c.id === id) || null;
