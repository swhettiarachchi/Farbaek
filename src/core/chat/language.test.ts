/**
 * Farbaek AI's language reader (stage 204, ADR 0221): scripts, languages typed in English letters, standard Latin-script
 * languages, mixed messages, short and unclear messages, and what's ignored. The owner's example sentences are here; the
 * separate labelled set is measured in language.golden.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readLanguage } from "./language";
import { LANGUAGES, readsAs } from "./language-names";

const reads = (text: string) => readLanguage(text);

describe("languages typed in English letters (the owner's examples)", () => {
  it.each([
    ["Mata website ekak hadaganna one.", "si"],
    ["Mujhe ek website banani hai.", "hi"],
    ["Enakku oru website create pannanum.", "ta"],
    ["Mujhe website banana sikhao.", "ur"],
    ["Keef fini a3mel website?", "ar"],
    ["Ya hochu sozdat novyy sayt.", "ru"],
    ["Privet, kak dela?", "ru"],
    ["Wo xiang zuo yi ge wangzhan.", "zh"],
    ["Watashi wa website o tsukuritai desu.", "ja"],
    ["Jeoneun websaiteureul mandeulgo sipeoyo.", "ko"],
  ])("%s reads as %s typed in English letters, not English", (text, code) => {
    const r = reads(text);
    expect(readsAs(r.language, code)).toBe(true);
    expect(r.script).toBe("Latin");
    expect(r.romanized).toBe(true);
    expect(r.confidence).not.toBe("low");
  });
});

describe("standard Latin-script languages (the owner's examples)", () => {
  it.each([
    ["Wie kann ich meine Website verbessern?", "de"],
    ["Ich möchte eine Website erstellen.", "de"],
    ["Cum pot să creez un website?", "ro"],
    ["Come posso creare un sito web?", "it"],
  ])("%s reads as %s, written in its own alphabet", (text, code) => {
    const r = reads(text);
    expect(r.language).toBe(code);
    expect(r.romanized).toBe(false);
    expect(r.confidence).not.toBe("low");
  });
});

/** One sentence for every language offered in settings: nothing is offered that isn't tested. */
const COVERAGE: Array<[string, string]> = [
  ["en", "Could you help me make a website for my shop?"],
  ["de", "Kannst du mir helfen, eine Website für meinen Laden zu bauen?"],
  ["it", "Puoi aiutarmi a fare un sito per il mio negozio?"],
  ["ro", "Poți să mă ajuți să fac un site pentru magazinul meu?"],
  ["fr", "Est-ce que tu peux m'expliquer comment faire un site ?"],
  ["es", "¿Puedes ayudarme a hacer una página web para mi tienda?"],
  ["pt", "Eu quero aprender a programar, você pode me ajudar?"],
  ["nl", "Kun je me helpen met mijn website, alsjeblieft?"],
  ["pl", "Chcę zrobić stronę internetową dla mojej firmy."],
  ["tr", "Bir web sitesi yapmak istiyorum, bana yardım eder misin?"],
  ["vi", "Bạn có thể giúp tôi làm một trang web không?"],
  ["id", "Saya ingin membuat website untuk toko saya."],
  ["ms", "Boleh awak tolong saya buat laman web?"],
  ["cs", "Můžeš mi pomoct s mým webem?"],
  ["sv", "Kan du hjälpa mig att bygga en hemsida?"],
  ["da", "Kan du hjælpe mig med at lave en hjemmeside?"],
  ["no", "Kan du hjelpe meg med å lage en nettside?"],
  ["fi", "Minä haluan oppia, voitko auttaa minua?"],
  ["hu", "Tudsz segíteni nekem egy weboldallal?"],
  ["hr", "Možeš li mi pomoći s mojom web stranicom?"],
  ["tl", "Puwede mo ba akong tulungan sa website ko?"],
  ["sw", "Je, unaweza kunisaidia kutengeneza tovuti?"],
  ["af", "Kan jy my asseblief help met my webwerf?"],
  // Typed in English letters.
  ["bn", "Ami ekta website banate chai, tumi ki amake help korbe?"],
  ["ne", "Malai ramro website chahiyo, tapai le garna sakchha?"],
  ["fa", "Man mikham ye website besazam, mitoonam?"],
  ["pa", "Tusi kiven ho? Mainu ik website chahidi hai."],
  ["gu", "Tame kem cho? Mane ek website joiye che."],
  ["mr", "Mala ek website havi aahe, tumhi madat karal ka?"],
  ["te", "Naku oka website kavali, meeru cheyyandi."],
  // In their own scripts.
  ["si", "මට උදව් ඕනේ"],
  ["ta", "எனக்கு உதவி வேண்டும்"],
  ["hi", "मुझे मदद चाहिए"],
  ["ur", "مجھے مدد چاہیے"],
  ["ar", "أحتاج إلى مساعدة"],
  ["ru", "Мне нужна помощь"],
  ["uk", "Мені потрібна допомога"],
  ["zh", "我需要帮助"],
  ["ja", "助けてください"],
  ["ko", "도와주세요"],
  ["th", "ฉันต้องการความช่วยเหลือ"],
  ["el", "Χρειάζομαι βοήθεια"],
  ["he", "אני צריך עזרה"],
  ["kn", "ನನಗೆ ಸಹಾಯ ಬೇಕು"],
  ["ml", "എനിക്ക് സഹായം വേണം"],
  ["km", "ខ្ញុំត្រូវការជំនួយ"],
  ["ka", "მჭირდება დახმარება"],
  ["hy", "Ինձ օգնություն է պետք"],
  ["am", "እርዳታ እፈልጋለሁ"],
  ["my", "ကျွန်တော် အကူအညီ လိုတယ်"],
];

describe("mixed messages (the owner's examples)", () => {
  it.each([
    ["Mata website ekak hadanna one using Next.js and PostgreSQL.", "si"],
    ["Je veux créer a website using React.", "fr"],
    ["Ich möchte eine AI application entwickeln.", "de"],
  ])("%s keeps its language (%s) and is marked mixed, not English", (text, code) => {
    const r = reads(text);
    expect(r.language).toBe(code);
    expect(r.mixed).toBe(true);
  });

  it("a message isn't English because of API, database, React or JavaScript", () => {
    expect(reads("Mage API eka database ekata connect wenne na, React app eke JavaScript error ekak enawa").language).toBe("si");
  });

  it("a message mostly in its own script with a few English words reads by the script, and is mixed", () => {
    const r = reads("මට React app එකක් හදන්න ඕනේ using Firebase");
    expect(r.language).toBe("si");
    expect(r.mixed).toBe(true);
  });
});

describe("short and unclear messages", () => {
  it.each(["Hi", "No", "Ma", "Tu", "Na", "Me", "ok", "Thanks", "Kohomada?"])("%s reads as low confidence", (text) => {
    expect(reads(text).confidence).toBe("low");
  });

  it("a short message in a script of its own is still certain", () => {
    expect(reads("ඔව්")).toMatchObject({ language: "si", confidence: "high" });
    expect(reads("네")).toMatchObject({ language: "ko", confidence: "high" });
  });

  it("a message with no letters reads as nothing", () => {
    expect(reads("👍 123 ?!")).toMatchObject({ language: null, script: null, confidence: "low" });
  });
});

describe("what carries no language", () => {
  it("code blocks, inline code, links, emails and paths are ignored", () => {
    const text = "Mata meka hadaganna one\n```ts\nconst theAnswer = await fetch(url).then((r) => r.json());\nexport default function Page() { return null }\n```\nand `npm run build` fails at https://example.com/docs/build-errors, src/app/page.tsx, mail me@example.com";
    expect(reads(text).language).toBe("si");
  });

  it("all-capital messages are read, not skipped as acronyms", () => {
    expect(reads("MATA WEBSITE EKAK HADAGANNA ONE").language).toBe("si");
  });

  it("Pinyin with tone numbers reads as Chinese", () => {
    expect(reads("ni3 hao3, wo3 xiang3 xue2 xi2 zhong1 wen2").language).toBe("zh");
  });

  it("Arabic digits-for-sounds count, product names with digits don't", () => {
    expect(reads("ana 3ayez a3raf ezay").language).toBe("ar");
    expect(reads("Deploy it with k8s and web3 tools on e2e tests please").language).toBe("en");
  });

  it("reading never changes the message", () => {
    const text = "Mata website ekak hadaganna one";
    const copy = `${text}`;
    reads(text);
    expect(text).toBe(copy);
  });
});

describe("every language offered in settings", () => {
  it("has an example sentence here", () => {
    const covered = new Set(COVERAGE.map(([code]) => code));
    expect(Object.keys(LANGUAGES).filter((code) => !covered.has(code))).toEqual([]);
  });
  it.each(COVERAGE)("%s: %s", (code, text) => {
    const r = reads(text);
    expect(readsAs(r.language, code)).toBe(true);
    expect(r.confidence).not.toBe("low");
  });
});
