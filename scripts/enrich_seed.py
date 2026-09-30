import json

with open("data/seed.json", "r", encoding="utf-8") as f:
    seed = json.load(f)

with open("data/dictionary.json", "r", encoding="utf-8") as f:
    dictionary = json.load(f)

with open("data/chars.json", "r", encoding="utf-8") as f:
    chars = json.load(f)

seed["videos"] = [
  {
    "id": "v01-greetings",
    "level": 1,
    "category": "beginner",
    "difficulty": "Stage 1 · Survival",
    "embedUrl": "https://www.youtube.com/embed/fW_7e93H2_Y",
    "title": { "en": "Essential Lao Daily Greetings & Politeness", "lo": "ການທັກທາຍ ແລະ ມາລະຍາດພາສາລາວໃນຊີວິດປະຈຳວັນ", "zh": "老挝语日常问候与礼仪" },
    "desc": { "en": "Learn natural greetings, respectful hand nop gestures, and friendly everyday responses with native speakers.", "lo": "ຮຽນຮູ້ການທັກທາຍແບບສຸພາບ, ການນົບ ແລະ ການຕອບຮັບທີ່ເປັນທຳມະຊາດ." },
    "transcript": [
      { "sp": "Somxai", "lo": "ສະບາຍດີຕອນເຊົ້າເອື້ອຍ! ມື້ນີ້ສະບາຍດີບໍ່?", "rom": "sà-bāi-dīi tɔɔn-sào ɯ̂aai! mɯ̂ɯ-nîi sà-bāi-dīi bɔ̀ɔ?", "en": "Good morning older sister! How are you doing today?" },
      { "sp": "Noy", "lo": "ສະບາຍດີ! ເອື້ອຍສະບາຍດີ, ຂອບໃຈຫຼາຍໆເດີ້.", "rom": "sà-bāi-dīi! ɯ̂aai sà-bāi-dīi, khɔ̌ɔp-jái lǎai-lǎai dêe.", "en": "Hello! I am doing well, thank you so much!" },
      { "sp": "Somxai", "lo": "ກິນເຂົ້າເຊົ້າແລ້ວບໍ?", "rom": "kin khào sào lɛ̂ɛo bɔ̀ɔ?", "en": "Have you eaten breakfast yet?" },
      { "sp": "Noy", "lo": "ກິນແລ້ວລະ, ເຈົ້າເດ?", "rom": "kin lɛ̂ɛo la, jâo de?", "en": "I have eaten already, and you?" }
    ],
    "vocab": [
      { "lo": "ສະບາຍດີ", "rom": "sà-bāi-dīi", "en": "hello / good health" },
      { "lo": "ຕອນເຊົ້າ", "rom": "tɔɔn-sào", "en": "morning time" },
      { "lo": "ກິນເຂົ້າເຊົ້າ", "rom": "kin khào sào", "en": "eat breakfast" },
      { "lo": "ຂອບໃຈ", "rom": "khɔ̌ɔp-jái", "en": "thank you" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "v02-vientiane-market",
    "level": 2,
    "category": "conversation",
    "difficulty": "Stage 2 · Everyday",
    "embedUrl": "https://www.youtube.com/embed/5a4x3w8k9fA",
    "title": { "en": "Shopping & Ordering Food at Talat Sao Market", "lo": "ການໄປຊື້ເຄື່ອງ ແລະ ສັ່ງອາຫານຢູ່ຕະຫຼາດເຊົ້າ", "zh": "万象早市购物与点餐" },
    "desc": { "en": "Real conversations for ordering fresh fruit, sticky rice, and asking prices politely.", "lo": "ການສົນທະນາຕົວຈິງໃນການຊື້ໝາກໄມ້, ເຂົ້າໜຽວ ແລະ ຖາມລາຄາ." },
    "transcript": [
      { "sp": "Customer", "lo": "ເອື້ອຍ, ໝາກກ້ວຍໜ່ວຍນີ້ຂາຍແນວໃດ?", "rom": "ɯ̂aai, màak-kùay nùay nîi khǎai nɛ́ɛo-dǎi?", "en": "Older sister, how do you sell these bananas?" },
      { "sp": "Vendor", "lo": "ຫວີລະ 15,000 ກີບເດີ້. ຫວານຫຼາຍ!", "rom": "wǐi la sìp-hâa phan kìip dêe. wǎan lǎai!", "en": "15,000 Kip per bunch. They are very sweet!" },
      { "sp": "Customer", "lo": "ຂໍ 2 ຫວີແດ່ເດີ້, ຫຼຸດໄດ້ບໍ່?", "rom": "khɔ̌ɔ sɔ̌ɔng wǐi dɛ̀ɛ dêe, lùt dài bɔ̀ɔ?", "en": "I would like 2 bunches please, can you give a small discount?" },
      { "sp": "Vendor", "lo": "ໄດ້ເລີຍ! ຄົນກັນເອງ, ເອົາ 28,000 ກີບພໍ.", "rom": "dài lə́əi! khon kan-ēeng, ao sâao-pɛ̀ɛt phan kìip phɔɔ.", "en": "Certainly! As friendly neighbors, 28,000 Kip is fine." }
    ],
    "vocab": [
      { "lo": "ຂາຍແນວໃດ", "rom": "khǎai nɛ́ɛo-dǎi", "en": "how is it sold / what is the price" },
      { "lo": "ຫຼຸດໄດ້ບໍ່", "rom": "lùt dài bɔ̀ɔ", "en": "can you give a discount?" },
      { "lo": "ຫວີ", "rom": "wǐi", "en": "bunch of bananas (classifier)" },
      { "lo": "ຄົນກັນເອງ", "rom": "khon kan-ēeng", "en": "friendly acquaintance / among friends" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "v03-tone-mastery",
    "level": 1,
    "category": "pronunciation",
    "difficulty": "Stage 0 · Foundation",
    "embedUrl": "https://www.youtube.com/embed/3v7X8k0w4mE",
    "title": { "en": "How Native Lao Speakers Shape the 6 Tones", "lo": "ວິທີການຜັນສຽງວັນນະຍຸດ 6 ສຽງ ໂດຍຄົນລາວແທ້", "zh": "老挝语6个声调的发音秘诀" },
    "desc": { "en": "A complete visual and audio breakdown of the 6 authentic Lao tone contours.", "lo": "ການອະທິບາຍລະດັບສຽງທັງ 6 ຢ່າງລະອຽດ ພ້ອມຕົວຢ່າງຄຳສັບ." },
    "transcript": [
      { "sp": "Teacher", "lo": "ສະບາຍດີນັກຮຽນທຸກຄົນ. ມື້ນີ້ເຮົາຊິມາຮຽນເລື່ອງສຽງວັນນະຍຸດ 6 ສຽງ.", "rom": "sà-bāi-dīi nák-hían thúk khon. mɯ̂ɯ-nîi háo si maa hían lɯ̂ang sǐang wán-nà-yút hók sǐang.", "en": "Hello students! Today we will learn about the 6 tone contours in Lao." },
      { "sp": "Teacher", "lo": "ສຽງທີໜຶ່ງ ແມ່ນສຽງສາມັນ: ກາ, ດີ, ປາ.", "rom": "sǐang thīi nɯ̀ng mɛ̀ɛn sǐang sǎa-mán: kāa, dīi, paa.", "en": "The first tone is Mid-Level: kaa, dii, paa." }
    ],
    "vocab": [
      { "lo": "ວັນນະຍຸດ", "rom": "wán-nà-yút", "en": "tone mark / tone" },
      { "lo": "ສຽງສາມັນ", "rom": "sǐang sǎa-mán", "en": "mid-level tone" },
      { "lo": "ຮຽນ", "rom": "hían", "en": "to study / learn" }
    ],
    "status": "published",
    "access": "free"
  }
]

seed["tones"] = [
  {
    "id": "tone-1",
    "num": 1,
    "name": { "en": "Tone 1: Mid-Level", "lo": "ສຽງສາມັນ (ສຽງກາງ)", "zh": "第一声：中平调" },
    "contour": "33 / 35",
    "color": "#0284c7",
    "desc": { "en": "Neutral mid-level pitch, relaxed and smooth. Very common in unmarked mid-consonant syllables.", "lo": "ສຽງກາງພຽງ ບໍ່ຂຶ້ນບໍ່ລົງ ຟັງສະບາຍ ພົບເລື້ອຍໃນອັກສອນກາງບໍ່ມີວັນນະຍຸດ." },
    "pathD": "M 10 32 Q 50 30 90 28",
    "examples": [
      { "lao": "ກາ", "rom": "kāa", "mean": "crow / kettle", "note": "Mid cons + long vowel" },
      { "lao": "ດີ", "rom": "dīi", "mean": "good / well", "note": "Mid cons + long vowel" },
      { "lao": "ປາ", "rom": "paa", "mean": "fish", "note": "Mid cons + long vowel" },
      { "lao": "ໄປ", "rom": "pai", "mean": "to go", "note": "Mid cons + mai may" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "tone-2",
    "num": 2,
    "name": { "en": "Tone 2: Low-Falling", "lo": "ສຽງເອກ (ສຽງຕ່ຳ)", "zh": "第二声：低降调" },
    "contour": "11 / 21",
    "color": "#059669",
    "desc": { "en": "Starts low and drops down in pitch. Produced with marked ໄມ້ເອກ (່) or dead syllables with short vowels.", "lo": "ສຽງເລີ່ມຕົ້ນຕ່ຳ ແລ້ວຫຼຸດລົງອີກ. ມັກເກີດກັບໄມ້ເອກ ່ ຫຼື ຄຳຕາຍ." },
    "pathD": "M 10 40 Q 50 48 90 55",
    "examples": [
      { "lao": "ກ່າ", "rom": "kàa", "mean": "sprout / shoot", "note": "Mid cons + ໄມ້ເອກ" },
      { "lao": "ໄຂ່", "rom": "khǎi", "mean": "egg", "note": "High cons + ໄມ້ເອກ" },
      { "lao": "ແມ່", "rom": "mɛ̂ɛ", "mean": "mother", "note": "Low cons + ໄມ້ເອກ" },
      { "lao": "ເຜັດ", "rom": "phét", "mean": "spicy", "note": "High cons + dead stop" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "tone-3",
    "num": 3,
    "name": { "en": "Tone 3: Low-Mid Falling", "lo": "ສຽງໂທກາງ / ຕົກ", "zh": "第三声：降调" },
    "contour": "31 / 32",
    "color": "#d97706",
    "desc": { "en": "Starts at mid pitch and falls firmly. Associated with ໄມ້ໂທ (້) on middle or high consonants.", "lo": "ເລີ່ມຕົ້ນລະດັບກາງ ແລ້ວຕົກລົງຢ່າງໜັກແໜ້ນ. ມັກເກີດກັບໄມ້ໂທ ້ ໃນອັກສອນກາງ ແລະ ສູງ." },
    "pathD": "M 10 25 Q 50 40 90 52",
    "examples": [
      { "lao": "ກ້າ", "rom": "kâa", "mean": "brave / bold", "note": "Mid cons + ໄມ້ໂທ" },
      { "lao": "ເຂົ້າ", "rom": "khào", "mean": "rice / enter", "note": "High cons + ໄມ້ໂທ" },
      { "lao": "ບ້ານ", "rom": "bâan", "mean": "village / home", "note": "Mid cons + ໄມ້ໂທ" },
      { "lao": "ເຫັນ", "rom": "hěn", "mean": "to see", "note": "High cons + dead syllable" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "tone-4",
    "num": 4,
    "name": { "en": "Tone 4: High-Level", "lo": "ສຽງຕີ (ສຽງສູງລອຍ)", "zh": "第四声：高平调" },
    "contour": "55 / 45",
    "color": "#7c3aed",
    "desc": { "en": "High, clear, sustained pitch contour without falling. Common with low consonants without tone marks.", "lo": "ສຽງສູງລອຍ ບໍ່ຫຼຸດລົງ. ພົບເລື້ອຍໃນອັກສອນຕ່ຳທີ່ບໍ່ມີວັນນະຍຸດ." },
    "pathD": "M 10 14 Q 50 13 90 12",
    "examples": [
      { "lao": "ມາ", "rom": "máa", "mean": "to come", "note": "Low cons + long vowel" },
      { "lao": "ມີ", "rom": "míi", "mean": "to have", "note": "Low cons + long vowel" },
      { "lao": "ເຮືອນ", "rom": "hɯ́an", "mean": "house / home", "note": "Low cons + live vowel" },
      { "lao": "ນ້ຳ", "rom": "nâm", "mean": "water", "note": "Low cons + ໄມ້ໂທ" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "tone-5",
    "num": 5,
    "name": { "en": "Tone 5: High-Falling / Rising", "lo": "ສຽງຈັດຕະວາ (ສຽງຂຶ້ນ)", "zh": "第五声：高降/升调" },
    "contour": "35 / 24",
    "color": "#db2777",
    "desc": { "en": "Begins low-mid and rises smoothly upward, similar to asking a question in English.", "lo": "ເລີ່ມຈາກລະດັບກາງ ແລ້ວຜັນຂຶ້ນສູງ ຄ້າຍຄືກັບການຖາມຄຳຖາມ." },
    "pathD": "M 10 46 Q 50 32 90 14",
    "examples": [
      { "lao": "ຂາ", "rom": "khǎa", "mean": "leg", "note": "High cons + live vowel" },
      { "lao": "ຫົວ", "rom": "hǔa", "mean": "head", "note": "High cons + live vowel" },
      { "lao": "ສອງ", "rom": "sɔ̌ɔng", "mean": "two (2)", "note": "High cons + live final" },
      { "lao": "ໝາ", "rom": "mǎa", "mean": "dog", "note": "High cons compound + live vowel" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "tone-6",
    "num": 6,
    "name": { "en": "Tone 6: High Falling Peak", "lo": "ສຽງໂທສູງ (ສຽງພິເສດ)", "zh": "第六声：高降调" },
    "contour": "52 / 41",
    "color": "#ea580c",
    "desc": { "en": "Soars up to maximum height before cutting or dropping down sharply.", "lo": "ສຽງພຸ່ງຂຶ້ນສູງສຸດ ແລ້ວຕົກລົງຢ່າງໄວວາ." },
    "pathD": "M 10 18 Q 45 10 90 48",
    "examples": [
      { "lao": "ມ້າ", "rom": "mâa", "mean": "horse", "note": "Low cons + ໄມ້ໂທ" },
      { "lao": "ຊື້", "rom": "sɯ̂ɯ", "mean": "to buy", "note": "Low cons + ໄມ້ໂທ" },
      { "lao": "ຮັກ", "rom": "hák", "mean": "to love", "note": "Low cons + dead syllable" },
      { "lao": "ນົກ", "rom": "nók", "mean": "bird", "note": "Low cons + dead stop" }
    ],
    "status": "published",
    "access": "free"
  }
]

seed["culture"] = [
  {
    "id": "cul-alms",
    "category": "traditions",
    "title": { "en": "Tak Bat: Morning Almsgiving in Luang Prabang", "lo": "ພິທີໃສ່ບາດເຂົ້າໜຽວຍາມເຊົ້າ ຢູ່ຫຼວງພະບາງ", "zh": "琅勃拉邦清晨布施仪式" },
    "desc": { "en": "A centuries-old spiritual tradition where saffron-robed monks walk silently through town collecting warm sticky rice.", "lo": "ຮີດຄອງປະເພນີອັນດີງາມທີ່ສືບທອດກັນມາຫຼາຍຮ້ອຍປີ ໂດຍພຣະສົງຍ່າງບິນທະບາດຮັບເຂົ້າໜຽວ." },
    "content": { "en": "Tak Bat is one of the most sacred Buddhist rituals in Laos. Every morning at dawn, hundreds of monks walk barefoot through the streets. Locals kneel respectfully on mats and place small handfuls of freshly steamed sticky rice into each alms bowl.", "lo": "ການໃສ່ບາດຍາມເຊົ້າ ເປັນວັດທະນະທຳທາງພຸດທະສາດສະໜາທີ່ສຳຄັນທີ່ສຸດຂອງລາວ. ຊາວບ້ານຈະຕື່ນແຕ່ເຊົ້າເພື່ອນຶ້ງເຂົ້າໜຽວໃໝ່ໆ ແລ້ວນັ່ງຄຸເຂົ່າລໍຖ້າໃສ່ບາດດ້ວຍຄວາມສະຫງົບ." },
    "keyTips": [
      { "tip": "Wear respectful clothing covering your shoulders and knees (ຄຸມບ່າໄຫຼ່ ແລະ ຫົວເຂົ່າ)" },
      { "tip": "Never touch the monks or hand anything directly into their hands (ຢ່າແຕະຕ້ອງພຣະສົງ)" },
      { "tip": "Maintain quiet silence and keep cameras at a respectful distance (ຮັກສາຄວາມສະຫງົບ)" },
      { "tip": "Take off your shoes when kneeling to place rice into the bowls (ຖອດເກີບເວລາໃສ່ບາດ)" }
    ],
    "vocab": [
      { "lao": "ໃສ່ບາດ", "rom": "sài-bàat", "en": "give alms into monk bowl" },
      { "lao": "ພຣະສົງ", "rom": "phrá-sǒng", "en": "Buddhist monks" },
      { "lao": "ເຂົ້າໜຽວ", "rom": "khào-nǐao", "en": "sticky rice" },
      { "lao": "ຄວາມສະຫງົບ", "rom": "khwaam-sà-ngóp", "en": "peace / silence" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "cul-baci",
    "category": "traditions",
    "title": { "en": "The Baci / Sou Khwan Calling Ceremony", "lo": "ພິທີບາສີສູ່ຂວັນ (ພິທີຜູກແຂນ)", "zh": "老挝栓线祈福仪式 (Baci)" },
    "desc": { "en": "The premier Lao soul-calling ceremony for weddings, welcoming travelers, healing, and Lao New Year.", "lo": "ພິທີອັນສັກສິດເພື່ອເອີ້ນຂວັນ, ຜູກແຂນອວຍພອນໃນໂອກາດສຳຄັນຕ່າງໆ." },
    "content": { "en": "The Baci ceremony is central to Lao identity. Lao people believe that a person is composed of 32 kwan (spirits/souls). The Morphon (elder officiant) chants blessings around the Phakhwan floral centerpiece, and elders tie white cotton threads around wrists to bind good fortune.", "lo": "ພິທີບາສີສູ່ຂວັນ ເປັນເອກະລັກຂອງຊາດລາວ. ເຊື່ອກັນວ່າຄົນເຮົາມີ 32 ຂວັນ. ໝໍພອນຈະສູດຂວັນ ແລະ ຜູກແຂນດ້ວຍຝ້າຍຂາວເພື່ອຄວາມເປັນສິริมົງຄົນ." },
    "keyTips": [
      { "tip": "Keep the white cotton threads on your wrists for at least 3 days for luck (ມັດໄວ້ຢ່າງໜ້ອຍ 3 ມື້)" },
      { "tip": "Place your right elbow on your left knee and raise your hands in nop (ຍໍມືນົບເວລາຮັບພອນ)" },
      { "tip": "Say 'Kop Chai' and 'Sabaidee' to elders who tie your strings (ຂອບໃຈຜູ້ເຖົ້າຜູ້ແກ່)" }
    ],
    "vocab": [
      { "lao": "ບາສີ", "rom": "baa-sǐi", "en": "baci blessing ceremony" },
      { "lao": "ສູ່ຂວັນ", "rom": "sùu-khwǎn", "en": "call the 32 souls back" },
      { "lao": "ຜູກແຂນ", "rom": "phùuk-khɛ̌ɛn", "en": "tie cotton strings on wrist" },
      { "lao": "ໝໍພອນ", "rom": "mɔ̌ɔ-phɔɔn", "en": "blessing master / elder officiant" }
    ],
    "status": "published",
    "access": "free"
  },
  {
    "id": "cul-khao-niao",
    "category": "food",
    "title": { "en": "Lao Sticky Rice Dining Etiquette (ຕິບເຂົ້າ)", "lo": "ມາລະຍາດການກິນເຂົ້າໜຽວ ແລະ ຕິບເຂົ້າ", "zh": "老挝糯米饭就餐礼仪" },
    "desc": { "en": "How to roll sticky rice with your right hand, dip into jeow sauces, and share from the wicker tip khao basket.", "lo": "ວິທີການປັ້ນເຂົ້າໜຽວດ້ວຍມືຂວາ, ຈ້ຳແຈ່ວ ແລະ ການກິນຮ່ວມກັນ." },
    "content": { "en": "Sticky rice (ເຂົ້າໜຽວ, khao niao) is the heartbeat of Lao cuisine. It is served in woven bamboo containers called Tip Khao. You pinch a small portion with your right hand, knead it into a neat ball, and use it as a scoop for laap, tam mak hoong, or spicy jeow pastes.", "lo": "ເຂົ້າໜຽວ ເປັນອາຫານຫຼັກຂອງຄົນລາວ. ເວລາກິນຈະໃຊ້ຕິບເຂົ້າ, ປັ້ນດ້ວຍມືຂວາໃຫ້ແໜ້ນ ແລ້ວຈ້ຳແຈ່ວ ຫຼື ກິນກັບລາບ." },
    "keyTips": [
      { "tip": "Always eat and pass food using your right hand (ໃຊ້ສະເພາະມືຂວາໃນການປັ້ນເຂົ້າ)" },
      { "tip": "Close the lid of the Tip Khao basket when finished to show respect (ປິດຝາຕິບເຂົ້າເມື່ອກິນອີ່ມ)" },
      { "tip": "Do not throw leftover rice onto the floor (ຢ່າຖິ້ມເຂົ້າລົງພື້ນ)" }
    ],
    "vocab": [
      { "lao": "ເຂົ້າໜຽວ", "rom": "khào-nǐao", "en": "sticky rice" },
      { "lao": "ຕິບເຂົ້າ", "rom": "tìp-khào", "en": "bamboo basket for rice" },
      { "lao": "ປັ້ນເຂົ້າ", "rom": "pân-khào", "en": "knead rice into ball" },
      { "lao": "ຈ້ຳແຈ່ວ", "rom": "jâm-jɛ̀ɛo", "en": "dip rice into chili paste" }
    ],
    "status": "published",
    "access": "free"
  }
]

seed["characters"] = [
  {
    "id": "char-" + char,
    "char": char,
    "name": data.get("name", char),
    "meaning": data.get("meaning", ""),
    "ipa": data.get("ipa", ""),
    "class": data.get("class", "middle"),
    "strokeCount": data.get("strokeCount", 1),
    "medial": data.get("medial", ""),
    "final": data.get("final", ""),
    "status": "published",
    "access": "free"
  }
  for char, data in chars.items()
]

dict_items = []
vocab_items = []
for w, a in list(dictionary.items())[:120]:
    p = a[0] if len(a) > 0 else ""
    pos = a[1] if len(a) > 1 else "v"
    en = a[2] if len(a) > 2 else ""
    level = a[3] if len(a) > 3 else 1
    lo = a[6] if len(a) > 6 else ""
    dict_items.append({
        "id": w,
        "hz": w,
        "p": p,
        "pos": pos,
        "level": level,
        "en": en,
        "lo": lo,
        "zh": "",
        "status": "published",
        "access": "free"
    })
    vocab_items.append({
        "id": w,
        "hz": w,
        "py": p,
        "pos": pos,
        "level": level,
        "tr": {
            "en": { "meaning": en },
            "lo": { "meaning": lo },
            "zh": { "meaning": "" }
        },
        "examples": [],
        "tags": ["core", "daily"],
        "status": "published",
        "access": "free"
    })

seed["dictionary"] = dict_items
seed["vocabulary"] = vocab_items
seed["audio"] = [
    { "id": "a-sabaidee", "text": "ສະບາຍດີ", "lang": "lo", "type": "word", "speaker": "native-female", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ສະບາຍດີ", "status": "published", "access": "free" },
    { "id": "a-khopchai", "text": "ຂອບໃຈ", "lang": "lo", "type": "word", "speaker": "native-female", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ຂອບໃຈ", "status": "published", "access": "free" },
    { "id": "a-kin", "text": "ກິນ", "lang": "lo", "type": "word", "speaker": "native-male", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ກິນ", "status": "published", "access": "free" },
    { "id": "a-deum", "text": "ດື່ມ", "lang": "lo", "type": "word", "speaker": "native-male", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ດື່ມ", "status": "published", "access": "free" },
    { "id": "a-khao", "text": "ເຂົ້າ", "lang": "lo", "type": "word", "speaker": "native-female", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ເຂົ້າ", "status": "published", "access": "free" },
    { "id": "a-nam", "text": "ນ້ຳ", "lang": "lo", "type": "word", "speaker": "native-female", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ນ້ຳ", "status": "published", "access": "free" },
    { "id": "a-pai", "text": "ໄປ", "lang": "lo", "type": "word", "speaker": "native-male", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ໄປ", "status": "published", "access": "free" },
    { "id": "a-maa", "text": "ມາ", "lang": "lo", "type": "word", "speaker": "native-male", "speed": "normal", "url": "", "relatedType": "vocabulary", "relatedId": "ມາ", "status": "published", "access": "free" }
]

with open("data/seed.json", "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, indent=2)

print("Enrich seed completed successfully!")
print("Videos count:", len(seed["videos"]))
print("Tones count:", len(seed["tones"]))
print("Culture count:", len(seed["culture"]))
print("Characters count:", len(seed["characters"]))
print("Dictionary count:", len(seed["dictionary"]))
