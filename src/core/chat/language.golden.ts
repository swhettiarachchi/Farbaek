/**
 * A labelled set for the language reader (stage 204, ADR 0221), written BEFORE the reader's word profiles and kept apart from them:
 * none of these sentences was used to build or tune `language.ts`, so the accuracy measured on them says something about messages
 * the reader hasn't seen. The examples in the owner's specification live in `language.test.ts` instead.
 *
 * Honest limits: these sentences were written by Claude (an AI), not collected from real people and not yet checked by native
 * speakers. Romanized spellings vary a great deal between people; these are one plausible spelling each.
 *
 * `language` is the expected reading: a language tag, or a family for languages that share a romanization or a script
 * ("hi|ur" for Hindi or Urdu in English letters, "hi|mr|ne" for Devanagari, "ar|ur|fa" for the Arabic script). Null means the
 * message is too short or too ambiguous to tell, and the reader should say its confidence is low.
 */
export interface GoldenCase {
  text: string;
  language: string | null;
  script: string;
  romanized: boolean;
}

export const GOLDEN: readonly GoldenCase[] = [
  // Native scripts.
  { text: "මට අද රෑට කෑම හදන්න උදව් කරන්න පුළුවන්ද?", language: "si", script: "Sinhala", romanized: false },
  { text: "ඔයාගේ නම මොකක්ද?", language: "si", script: "Sinhala", romanized: false },
  { text: "मैं कल दिल्ली जा रहा हूँ, मौसम कैसा रहेगा?", language: "hi|mr|ne", script: "Devanagari", romanized: false },
  { text: "நாளைக்கு எனக்கு ஒரு மீட்டிங் இருக்கு", language: "ta", script: "Tamil", romanized: false },
  { text: "مجھے اردو میں جواب چاہیے", language: "ar|ur|fa", script: "Arabic", romanized: false },
  { text: "كيف يمكنني تعلم البرمجة بسرعة؟", language: "ar|ur|fa", script: "Arabic", romanized: false },
  { text: "Как мне научиться программировать?", language: "ru|uk|bg|sr|mk|be|kk", script: "Cyrillic", romanized: false },
  { text: "我想学习做菜", language: "zh", script: "Han", romanized: false },
  { text: "明日は雨が降りますか？", language: "ja", script: "Japanese", romanized: false },
  { text: "오늘 날씨가 정말 좋네요", language: "ko", script: "Hangul", romanized: false },
  { text: "วันนี้คุณเป็นอย่างไรบ้าง", language: "th", script: "Thai", romanized: false },
  { text: "Πώς μπορώ να μάθω ελληνικά;", language: "el", script: "Greek", romanized: false },
  { text: "אני רוצה ללמוד לבשל", language: "he", script: "Hebrew", romanized: false },
  { text: "আমি আজ বাজারে যাব", language: "bn", script: "Bengali", romanized: false },
  { text: "ਮੈਨੂੰ ਪੰਜਾਬੀ ਸਿੱਖਣੀ ਹੈ", language: "pa", script: "Gurmukhi", romanized: false },
  { text: "મને ગુજરાતી ગમે છે", language: "gu", script: "Gujarati", romanized: false },
  { text: "నాకు తెలుగు నేర్చుకోవాలి", language: "te", script: "Telugu", romanized: false },
  { text: "ನನಗೆ ಕನ್ನಡ ಇಷ್ಟ", language: "kn", script: "Kannada", romanized: false },
  { text: "എനിക്ക് മലയാളം പഠിക്കണം", language: "ml", script: "Malayalam", romanized: false },
  { text: "ខ្ញុំចង់រៀនភាសាខ្មែរ", language: "km", script: "Khmer", romanized: false },
  { text: "მინდა ქართული ვისწავლო", language: "ka", script: "Georgian", romanized: false },
  { text: "Ես ուզում եմ սովորել", language: "hy", script: "Armenian", romanized: false },
  { text: "ኢትዮጵያ ውብ ሀገር ናት", language: "am", script: "Ethiopic", romanized: false },
  { text: "ကျွန်တော် မြန်မာစာ သင်ချင်တယ်", language: "my", script: "Myanmar", romanized: false },

  // Languages written in the Latin alphabet as normal.
  { text: "Can you recommend a good book for the weekend?", language: "en", script: "Latin", romanized: false },
  { text: "I'm not sure how to start my presentation for tomorrow", language: "en", script: "Latin", romanized: false },
  { text: "Kannst du mir bitte erklären, wie das funktioniert?", language: "de", script: "Latin", romanized: false },
  { text: "Wir fahren am Wochenende an die Ostsee", language: "de", script: "Latin", romanized: false },
  { text: "Je ne comprends pas pourquoi ça ne marche pas", language: "fr", script: "Latin", romanized: false },
  { text: "Est-ce que tu peux m'aider avec mes devoirs ?", language: "fr", script: "Latin", romanized: false },
  { text: "¿Dónde puedo comprar entradas para el concierto?", language: "es", script: "Latin", romanized: false },
  { text: "Necesito ayuda con mi tarea de matemáticas", language: "es", script: "Latin", romanized: false },
  { text: "Você pode me ajudar a escrever um e-mail?", language: "pt", script: "Latin", romanized: false },
  { text: "Não sei o que fazer com o meu carro", language: "pt", script: "Latin", romanized: false },
  { text: "Domani vado al mare con i miei amici", language: "it", script: "Latin", romanized: false },
  { text: "Mi puoi spiegare questa frase?", language: "it", script: "Latin", romanized: false },
  { text: "Ik weet niet hoe ik dit moet doen", language: "nl", script: "Latin", romanized: false },
  { text: "Mâine merg la munte cu familia", language: "ro", script: "Latin", romanized: false },
  { text: "Poți să mă ajuți cu o rețetă?", language: "ro", script: "Latin", romanized: false },
  { text: "Czy możesz mi pomóc z tym zadaniem?", language: "pl", script: "Latin", romanized: false },
  { text: "Bugün hava çok güzel, dışarı çıkalım mı?", language: "tr", script: "Latin", romanized: false },
  { text: "Jag vill lära mig att laga mat", language: "sv", script: "Latin", romanized: false },
  { text: "Haluan oppia uuden kielen", language: "fi", script: "Latin", romanized: false },
  { text: "Szeretnék megtanulni főzni", language: "hu", script: "Latin", romanized: false },
  { text: "Chci se naučit vařit", language: "cs", script: "Latin", romanized: false },
  { text: "Tôi muốn học nấu ăn", language: "vi", script: "Latin", romanized: false },
  { text: "Saya mau belajar memasak", language: "id|ms", script: "Latin", romanized: false },
  { text: "Gusto kong matutong magluto", language: "tl", script: "Latin", romanized: false },
  { text: "Nataka kujifunza kupika", language: "sw", script: "Latin", romanized: false },

  // Languages typed in English letters.
  { text: "Oya kohomada? Mama hondin innawa", language: "si", script: "Latin", romanized: true },
  { text: "Mata heta office yanna one", language: "si", script: "Latin", romanized: true },
  { text: "Meka karanne kohomada kiyala kiyanna puluwanda?", language: "si", script: "Latin", romanized: true },
  { text: "Aaj mausam bahut accha hai", language: "hi|ur", script: "Latin", romanized: true },
  { text: "Kya tum mujhe ye samjha sakte ho?", language: "hi|ur", script: "Latin", romanized: true },
  { text: "Enakku romba pasikkudhu", language: "ta", script: "Latin", romanized: true },
  { text: "Neenga eppadi irukeenga?", language: "ta", script: "Latin", romanized: true },
  { text: "Naaku ee pani cheyyali", language: "te", script: "Latin", romanized: true },
  { text: "Ami tomake bhalobashi", language: "bn", script: "Latin", romanized: true },
  { text: "Malai yo kura bujhna sahayog chahinchha", language: "ne", script: "Latin", romanized: true },
  { text: "Ana 3ayez a3raf ezay a3mel da", language: "ar", script: "Latin", romanized: true },
  { text: "Shu esmak? Ana min Beirut", language: "ar", script: "Latin", romanized: true },
  { text: "Ya ne ponimayu, chto eto znachit", language: "ru", script: "Latin", romanized: true },
  { text: "Spasibo, eto ochen pomoglo", language: "ru", script: "Latin", romanized: true },
  { text: "Ni hao, wo jiao Li Ming", language: "zh", script: "Latin", romanized: true },
  { text: "Wo bu zhidao zenme zuo", language: "zh", script: "Latin", romanized: true },
  { text: "Kore wa nan desu ka?", language: "ja", script: "Latin", romanized: true },
  { text: "Nihongo o benkyou shite imasu", language: "ja", script: "Latin", romanized: true },
  { text: "Annyeonghaseyo, jeoneun Minsu-ieyo", language: "ko", script: "Latin", romanized: true },
  { text: "Man farsi yad migiram", language: "fa", script: "Latin", romanized: true },

  // Mixed with English technical words.
  { text: "Mage laptop eke wifi connect wenne na", language: "si", script: "Latin", romanized: true },
  { text: "Mujhe React aur Node.js sikhna hai", language: "hi|ur", script: "Latin", romanized: true },
  { text: "Ich will eine App mit Flutter und Firebase bauen", language: "de", script: "Latin", romanized: false },
  { text: "Quiero aprender Python y machine learning", language: "es", script: "Latin", romanized: false },

  // Too short to tell.
  { text: "ok", language: null, script: "Latin", romanized: false },
  { text: "Na", language: null, script: "Latin", romanized: false },
  { text: "Tu?", language: null, script: "Latin", romanized: false },
  { text: "Hmm", language: null, script: "Latin", romanized: false },
];
