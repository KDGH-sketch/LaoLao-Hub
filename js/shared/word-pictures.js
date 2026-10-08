// Picture hints for flashcards: an emoji for words that can be pictured, found from the word's English meaning.
// Abstract words have none on purpose; their hints come from context instead (js/shared/flashcards.js hintsFor).
// Emoji are text, so they need no image files and work offline.
const PICTURES = {
  // people and family
  "father": "👨", "dad": "👨", "mother": "👩", "mom": "👩", "child": "🧒", "children": "🧒", "baby": "👶", "son": "👦", "daughter": "👧",
  "older brother": "👦", "younger brother": "👦", "older sister": "👧", "younger sister": "👧", "sibling": "🧑‍🤝‍🧑", "friend": "🧑‍🤝‍🧑",
  "grandfather": "👴", "grandmother": "👵", "husband": "🤵", "wife": "👰", "family": "👪", "person": "🧑", "people": "👥", "man": "👨", "woman": "👩",
  "teacher": "🧑‍🏫", "student": "🧑‍🎓", "doctor": "🧑‍⚕️", "monk": "🧘", "king": "👑", "farmer": "🧑‍🌾", "police": "👮",
  // food and drink
  "rice": "🍚", "sticky rice": "🍙", "noodle": "🍜", "noodles": "🍜", "soup": "🍲", "food": "🍱", "meal": "🍽️", "eat": "🍽️", "drink": "🥤",
  "water": "💧", "tea": "🍵", "coffee": "☕", "beer": "🍺", "milk": "🥛", "egg": "🥚", "fish": "🐟", "chicken": "🐔", "pork": "🥩", "beef": "🥩", "meat": "🥩",
  "fruit": "🍎", "banana": "🍌", "mango": "🥭", "papaya": "🍈", "coconut": "🥥", "vegetable": "🥬", "salt": "🧂", "sugar": "🍬", "chili": "🌶️", "bread": "🍞",
  "sweet": "🍬", "spicy": "🌶️", "delicious": "😋", "hungry": "🤤", "full": "😌", "cook": "🍳",
  // animals and nature
  "dog": "🐕", "cat": "🐈", "bird": "🐦", "elephant": "🐘", "buffalo": "🐃", "water buffalo": "🐃", "cow": "🐄", "pig": "🐖", "horse": "🐎",
  "tiger": "🐅", "monkey": "🐒", "snake": "🐍", "duck": "🦆", "goat": "🐐", "mosquito": "🦟", "bee": "🐝", "frog": "🐸",
  "tree": "🌳", "flower": "🌸", "river": "🏞️", "mountain": "⛰️", "sea": "🌊", "rain": "🌧️", "sun": "☀️", "moon": "🌙", "star": "⭐", "fire": "🔥",
  "wind": "🌬️", "cloud": "☁️", "hot": "🥵", "cold": "🥶", "forest": "🌲", "field": "🌾", "rice field": "🌾",
  // places and things
  "house": "🏠", "home": "🏠", "school": "🏫", "temple": "🛕", "market": "🛒", "shop": "🏪", "store": "🏪", "hospital": "🏥", "restaurant": "🍽️",
  "hotel": "🏨", "bank": "🏦", "village": "🏘️", "city": "🏙️", "country": "🗺️", "road": "🛣️", "bridge": "🌉", "airport": "✈️", "room": "🚪", "toilet": "🚻",
  "car": "🚗", "bus": "🚌", "bicycle": "🚲", "motorbike": "🏍️", "boat": "🛶", "plane": "✈️", "train": "🚆", "tuk-tuk": "🛺",
  "book": "📖", "pen": "🖊️", "phone": "📱", "telephone": "📱", "money": "💵", "kip": "💴", "bag": "👜", "clothes": "👕", "shirt": "👕", "hat": "👒",
  "shoes": "👟", "door": "🚪", "table": "🪑", "chair": "🪑", "bed": "🛏️", "key": "🔑", "clock": "🕰️", "watch": "⌚", "ticket": "🎫", "gift": "🎁",
  "cup": "🥤", "glass": "🥛", "bowl": "🥣", "spoon": "🥄", "medicine": "💊", "computer": "💻", "picture": "🖼️", "letter": "✉️", "fan": "🪭", "umbrella": "☂️",
  // body
  "eye": "👁️", "eyes": "👀", "ear": "👂", "nose": "👃", "mouth": "👄", "hand": "✋", "foot": "🦶", "head": "🗣️", "hair": "💇", "heart": "❤️", "tooth": "🦷",
  // actions you can picture
  "sleep": "😴", "walk": "🚶", "run": "🏃", "swim": "🏊", "sit": "🪑", "read": "📖", "write": "✍️", "sing": "🎤", "dance": "💃", "play": "🎮", "work": "💼",
  "study": "📚", "learn": "📚", "buy": "🛍️", "sell": "🏷️", "pay": "💳", "go": "➡️", "come": "⬅️", "give": "🤲", "see": "👀", "look": "👀", "watch tv": "📺",
  "listen": "👂", "hear": "👂", "speak": "🗣️", "say": "🗣️", "call": "📞", "wash": "🧼", "laugh": "😂", "cry": "😢", "smile": "😊", "love": "❤️", "think": "🤔",
  "open": "🔓", "close": "🔒", "travel": "🧳", "drive": "🚗", "fly": "✈️", "wait": "⏳", "wake up": "⏰",
  // describing words you can picture
  "big": "🐘", "small": "🐜", "happy": "😊", "sad": "😢", "tired": "😩", "sick": "🤒", "beautiful": "🌸", "good": "👍", "bad": "👎", "new": "✨", "old": "🏚️",
  "fast": "⚡", "slow": "🐢", "expensive": "💰", "cheap": "🏷️", "far": "🗺️", "near": "📍", "many": "🔢", "white": "⚪", "black": "⚫", "red": "🔴", "green": "🟢",
  "blue": "🔵", "yellow": "🟡",
  // greetings and time
  "hello": "👋", "goodbye": "👋", "thank you": "🙏", "thanks": "🙏", "sorry": "🙇", "yes": "✅", "no": "❌", "day": "🌞", "night": "🌙", "morning": "🌅",
  "evening": "🌆", "today": "📅", "tomorrow": "📅", "yesterday": "📅", "week": "🗓️", "month": "🗓️", "year": "🗓️", "time": "⏰", "hour": "⏰",
  // numbers
  "zero": "0️⃣", "one": "1️⃣", "two": "2️⃣", "three": "3️⃣", "four": "4️⃣", "five": "5️⃣", "six": "6️⃣", "seven": "7️⃣", "eight": "8️⃣", "nine": "9️⃣", "ten": "🔟",
  "hundred": "💯"
};
// the meaning's first gloss, without "to " and articles, is looked up; a few words of a longer gloss are tried as well
export function pictureFor(en){
  const g = String(en || "").toLowerCase().split(/;|\//)[0].replace(/\(.*?\)/g, "").replace(/^\s*(to|a|an|the)\s+/, "").trim();
  if (!g) return "";
  if (PICTURES[g]) return PICTURES[g];
  const words = g.split(/[\s,]+/).filter(Boolean);
  if (words.length <= 3) for (const w of words) if (PICTURES[w] && !/^(go|come|one|no|yes|new|old|good|bad|day|time)$/.test(w)) return PICTURES[w];
  return "";
}
export const PICTURE_COUNT = Object.keys(PICTURES).length;
