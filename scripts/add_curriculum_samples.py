import json

with open("data/seed.json", "r", encoding="utf-8") as f:
    seed = json.load(f)

# Add 2 more lessons
extra_lessons = [
    {
        "id": "hsk2-talat",
        "level": 2,
        "topic": "Shopping & Markets",
        "title": { "en": "Shopping at Talat Sao Morning Market", "lo": "ການໄປຊື້ເຄື່ອງຢູ່ຕະຫຼາດເຊົ້າ", "zh": "早市购物" },
        "desc": { "en": "Learn to ask prices, negotiate politely, and purchase fresh fruits and Lao textiles.", "lo": "ຮຽນຮູ້ການຖາມລາຄາ, ຕໍ່ລອງລາຄາແບບສຸພາບ ແລະ ຊື້ໝາກໄມ້ສົດ." },
        "objectives": { "en": ["Ask prices using thào-dǎi", "Use Kip currency numbers", "Negotiate politely with lùt dài bɔ̀ɔ"], "lo": ["ຖາມລາຄາດ້ວຍຄຳວ່າ ເທົ່າໃດ", "ນັບເງິນກີບ", "ຂໍຫຼຸດລາຄາ"] },
        "vocab": ["ຕະຫຼາດ", "ຊື້", "ຂາຍ", "ລາຄາ", "ເທົ່າໃດ", "ຫຼຸດ", "ກີບ"],
        "patterns": [11, 81],
        "grammar": ["g-time"],
        "dialogues": ["d-shopping"],
        "quizzes": ["q-market"],
        "audio": ["a-sabaidee", "a-khopchai"],
        "status": "published",
        "access": "free"
    },
    {
        "id": "hsk2-restaurant",
        "level": 2,
        "topic": "Food & Dining",
        "title": { "en": "Dining Out & Ordering Food", "lo": "ການກິນເຂົ້າຢູ່ຮ້ານອາຫານ", "zh": "餐厅就餐" },
        "desc": { "en": "Order traditional Lao dishes like Tam Mak Hoong, Larb, and sticky rice.", "lo": "ສັ່ງອາຫານລາວພື້ນເມືອງ: ຕຳໝາກຫຸ່ງ, ລາບ ແລະ ເຂົ້າໜຽວ." },
        "objectives": { "en": ["Call a waiter politely with nɔ̂ɔng/ɯ̂aai", "Order food with khɔ̌ɔ...", "Specify spiciness with bɔ̀ɔ phèt"], "lo": ["ຮຽກພະນັກງານແບບສຸພາບ", "ສັ່ງອາຫານດ້ວຍຄຳວ່າ ຂໍ", "ບອກລະດັບຄວາມເຜັດ"] },
        "vocab": ["ຮ້ານອາຫານ", "ສັ່ງ", "ຕຳໝາກຫຸ່ງ", "ລາບ", "ເຂົ້າໜຽວ", "ແຊບ", "ເຜັດ"],
        "patterns": [97, 117],
        "grammar": ["g-svo"],
        "dialogues": ["d-coffee"],
        "quizzes": ["q-drinks"],
        "audio": ["a-kin", "a-deum"],
        "status": "published",
        "access": "free"
    }
]

for l in extra_lessons:
    if not any(x["id"] == l["id"] for x in seed["lessons"]):
        seed["lessons"].append(l)

# Add extra dialogues
extra_dialogues = [
    {
        "id": "d-shopping",
        "level": 2,
        "title": { "en": "Buying Fresh Mangoes at the Market", "lo": "ການຊື້ໝາກມ່ວງຢູ່ຕະຫຼາດ", "zh": "在市场买芒果" },
        "lines": [
            { "speaker": "Customer", "zh": "ເອື້ອຍ, ໝາກມ່ວງນີ້ໂລລະເທົ່າໃດ?", "en": "Sister, how much per kilo for these mangoes?", "py": "ɯ̂aai, màak-mùang nîi loo la thào-dǎi?" },
            { "speaker": "Vendor", "zh": "ໂລລະ 25,000 ກີບເດີ້. ຫວານຫຼາຍ!", "en": "25,000 Kip per kilo. Very sweet!", "py": "loo la sâao-hâa phan kìip dêe. wǎan lǎai!" },
            { "speaker": "Customer", "zh": "ຂໍ 2 ໂລແດ່ເດີ້, 50,000 ກີບພໍດີ.", "en": "I will take 2 kilos please, exactly 50,000 Kip.", "py": "khɔ̌ɔ sɔ̌ɔng loo dɛ̀ɛ dêe, hâa-sìp phan kìip phɔɔ-dīi." }
        ],
        "status": "published",
        "access": "free"
    },
    {
        "id": "d-coffee",
        "level": 1,
        "title": { "en": "Ordering Traditional Lao Coffee", "lo": "ການສັ່ງກາເຟໂບຮານ", "zh": "点老挝传统咖啡" },
        "lines": [
            { "speaker": "Customer", "zh": "ສະບາຍດີ, ຂໍກາເຟນົມເຢັນຈອກໜຶ່ງແດ່.", "en": "Hello, please give me one iced milk coffee.", "py": "sà-bāai-dīi, khɔ̌ɔ kaa-feh nom yen jɔ̀ɔk nɯ̀ng dɛ̀ɛ." },
            { "speaker": "Barista", "zh": "ຫວານໜ້ອຍ ຫຼື ຫວານຫຼາຍ?", "en": "Less sweet or regular sweet?", "py": "wǎan nɔ̂ɔi rɯ̌ɯ wǎan lǎai?" },
            { "speaker": "Customer", "zh": "ຫວານໜ້ອຍເດີ້, ຂອບໃຈ.", "en": "Less sweet please, thank you.", "py": "wǎan nɔ̂ɔi dêe, khɔ̌ɔp-jái." }
        ],
        "status": "published",
        "access": "free"
    }
]

for d in extra_dialogues:
    if not any(x["id"] == d["id"] for x in seed["dialogues"]):
        seed["dialogues"].append(d)

# Add extra quizzes
extra_quizzes = [
    {
        "id": "q-market",
        "level": 2,
        "kind": "quiz",
        "title": { "en": "Market Shopping & Bargaining Quiz", "lo": "ແບບທົດສອບການຊື້ເຄື່ອງ", "zh": "市场购物测验" },
        "questions": [
            { "type": "choice", "q": "How do you ask 'How much is this?' in Lao?", "a": "ອັນນີ້ເທົ່າໃດ?", "choices": ["ອັນນີ້ເທົ່າໃດ?", "ອັນນີ້ແມ່ນຫຍັງ?", "ເຈົ້າໄປໃສ?", "ສະບາຍດີບໍ?"] },
            { "type": "choice", "q": "Which phrase politely asks for a small discount?", "a": "ຫຼຸດໄດ້ບໍ່?", "choices": ["ຫຼຸດໄດ້ບໍ່?", "ແພງຫຼາຍ", "ບໍ່ເອົາ", "ຂອບໃຈ"] }
        ],
        "status": "published",
        "access": "free"
    }
]

for q in extra_quizzes:
    if not any(x["id"] == q["id"] for x in seed["quizzes"]):
        seed["quizzes"].append(q)

with open("data/seed.json", "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, indent=2)

print("Curriculum samples enriched! Lessons:", len(seed["lessons"]), "Dialogues:", len(seed["dialogues"]), "Quizzes:", len(seed["quizzes"]))
