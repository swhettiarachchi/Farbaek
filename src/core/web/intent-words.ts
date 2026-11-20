/**
 * Words for "today", "now", "latest", "price" and "news" in the languages Chat is tested in (stage 206, ADR 0223), so a
 * question in any of them is read as needing the live web, like "latest" in English. One short line per language; a language
 * that isn't here reads as "unsure" and the planner model decides. Each list is separated by "|".
 */

/** Languages written with spaces between words: matched as whole words. */
export const FRESH_SPACED: string[] = [];
/** Languages written without spaces: matched anywhere. */
export const FRESH_UNSPACED: string[] = [];
/** The words for news alone, for the news search. */
export const NEWS_SPACED: string[] = [];
export const NEWS_UNSPACED: string[] = [];

// Tamil, and Tamil in English letters.
FRESH_SPACED.push("இன்று | இப்போது | சமீபத்திய | புதிய | செய்தி | செய்திகள் | விலை | innaiku | inniku | ippo | pudhu | seithi | vilai");
NEWS_SPACED.push("செய்தி | செய்திகள் | seithi");
// Hindi, and Hindi or Urdu in English letters.
FRESH_SPACED.push("आज | अभी | ताज़ा | ताजा | नया | खबर | ख़बर | समाचार | कीमत | दाम | aaj | abhi | taza | taaza | khabar | khabrein | samachar | kimat | keemat | daam");
NEWS_SPACED.push("खबर | ख़बर | समाचार | khabar | khabrein | samachar");
// Spanish, Portuguese, French, Italian.
FRESH_SPACED.push("hoy | ahora | últimas | ultimas | última | reciente | recientes | noticias | precio | precios | actualmente");
FRESH_SPACED.push("hoje | agora | últimas | ultimas | recente | recentes | notícias | noticias | preço | preco | atual | atualmente");
FRESH_SPACED.push("aujourd'hui | aujourd’hui | maintenant | dernières | dernieres | dernier | récent | recent | actualités | actualites | prix | actuel | actuellement");
FRESH_SPACED.push("oggi | adesso | ultime | ultima | recente | recenti | notizie | prezzo | prezzi | attuale | attualmente");
NEWS_SPACED.push("noticias | notícias | actualités | actualites | notizie | nouvelles");
// German, Dutch.
FRESH_SPACED.push("heute | jetzt | aktuell | aktuelle | aktuellen | neueste | neuesten | nachrichten | preis | preise");
FRESH_SPACED.push("vandaag | nu | laatste | recente | nieuws | prijs | prijzen | actueel | actuele");
NEWS_SPACED.push("nachrichten | nieuws");
// Russian, Arabic, Korean.
FRESH_SPACED.push("сегодня | сейчас | последние | последний | свежие | новости | цена | цены | актуальный | актуальные");
FRESH_SPACED.push("اليوم | الآن | الان | أحدث | احدث | آخر | اخر | أخبار | اخبار | سعر | أسعار | اسعار | الحالي");
FRESH_SPACED.push("오늘 | 지금 | 최신 | 최근 | 뉴스 | 가격 | 현재 | 요즘");
NEWS_SPACED.push("новости | أخبار | اخبار | 뉴스");
// Japanese and Chinese: no spaces between words.
FRESH_UNSPACED.push("今日 | 最新 | 最近 | ニュース | 価格 | 値段 | 現在 | 速報");
FRESH_UNSPACED.push("今天 | 现在 | 現在 | 最新 | 最近 | 新闻 | 新聞 | 价格 | 價格 | 目前 | 当前");
NEWS_UNSPACED.push("ニュース | 速報 | 新闻 | 新聞");

// The weather and tomorrow, where the word means nothing else.
FRESH_SPACED.push("clima | météo | meteo | wetter | weer | погода | الطقس | मौसम | வானிலை | 날씨 | demain | domani | amanhã | завтра | நாளை | 내일");
FRESH_UNSPACED.push("天気 | 天气 | 明日 | 明天");

/** Greetings and small talk in the other languages Chat is tested in: a message of only these needs no search. */
export const GREETINGS_SPACED: string[] = [];
export const GREETINGS_UNSPACED: string[] = [];
GREETINGS_SPACED.push("hola | qué tal | que tal | buenos días | buenos dias | buenas tardes | buenas noches | cómo estás | como estas | gracias");
GREETINGS_SPACED.push("bonjour | bonsoir | salut | ça va | ca va | comment ça va | merci | olá | ola | bom dia | boa tarde | boa noite | tudo bem | obrigado | obrigada");
GREETINGS_SPACED.push("guten morgen | guten tag | guten abend | hallo | wie geht's | wie gehts | wie geht es dir | danke | hoi | goedemorgen | goedemiddag | hoe gaat het | dank je");
GREETINGS_SPACED.push("ciao | buongiorno | buonasera | come stai | grazie | привет | здравствуйте | как дела | доброе утро | добрый день | спасибо");
GREETINGS_SPACED.push("مرحبا | السلام عليكم | كيف حالك | صباح الخير | شكرا | नमस्ते | नमस्कार | कैसे हो | कैसे हैं | धन्यवाद | வணக்கம் | எப்படி இருக்கீங்க | நன்றி | 안녕하세요 | 안녕 | 감사합니다");
GREETINGS_SPACED.push("namaste | namaskar | kaise ho | kya haal hai | shukriya | vanakkam | eppadi irukkinga | nandri | salam");
GREETINGS_UNSPACED.push("こんにちは | おはようございます | おはよう | こんばんは | ありがとう | 你好 | 您好 | 早上好 | 晚上好 | 谢谢");
