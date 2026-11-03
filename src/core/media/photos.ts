/**
 * Real photographs the agent and Studio can use as stand-ins (ADR 0156,
 * widened by ADR 0158), sorted by subject so a bakery gets bread and a hotel
 * gets rooms, never a random landscape. Two sources, both free to use under
 * the Unsplash License with no attribution needed, each photo looked at and
 * sorted by hand:
 * - Unsplash photos by their id (a string), served from images.unsplash.com,
 *   for businesses: bakeries, cafés, restaurants, hotels, spas, fashion,
 *   jewellery, homes, events, devices, studios, salons, gyms and teams.
 *   Free photos only, never Unsplash+.
 * - Lorem Picsum photos by number, for places and atmosphere.
 * They stay marked as placeholders until the person puts their own photo in.
 */

type PhotoId = number | string;

export const PHOTO_SUBJECTS = {
  bakery: { words: "bread, croissants, pastries and bakery shelves", ids: ["1509440159596-0249088772ff", "1555507036-ab1f4038808a", "1568254183919-78a4f43a2877", "1517686469429-8bdb88b9f907", "1534432182912-63863115e106", "1598373182133-52452f7691ef", "1549413468-cd78edb7e75c", "1623334044303-241021148842"] },
  cafe: { words: "coffee, latte art and café interiors", ids: ["1509042239860-f550ce710b93", "1542372147193-a7aca54189cd", "1541167760496-1628856ab772", "1567880905822-56f8e06fe630", "1511920170033-f8396924c348", "1495474472287-4d71bcdd2085", "1447933601403-0c6688de566e"] },
  restaurant: { words: "plated dishes, chefs and dining rooms", ids: ["1414235077428-338989a2e8c0", "1663530761401-15eefb544889", "1467003909585-2f8a72700288", "1551632436-cbf8dd35adfa", "1560053608-13721e0d69e8", "1676471926534-d5c9771909fa", "1774989423979-6a7bf5add3f0"] },
  hotel: { words: "hotel rooms, beds and lobbies", ids: ["1618773928121-c32242e63f39", "1611892440504-42a792e24d32", "1578683010236-d716f9a3f461", "1564078516393-cf04bd966897", "1621293954908-907159247fc8", "1582719478250-c89cae4dc85b", "1505693416388-ac5ce068fe85"] },
  spa: { words: "massage, stones, candles and calm water", ids: ["1600334089648-b0d9d3028eb2", "1544843776-7c98a52e08a4", "1554424518-336ec861b705", "1706795033917-dee116e7cba2", "1600334129128-685c5582fd35", "1729003702131-51807464dcec"] },
  resort: { words: "pools, palms and loungers", ids: ["1623718649591-311775a30c43", "1610641818989-c2051b5e2cfd", "1584132869994-873f9363a562", "1693934304978-22274e6a3276", "1582719508461-905c673771fd", "1549294413-26f195200c16"] },
  fashion: { words: "editorial portraits and outfits", ids: ["1603189343302-e603f7add05a", "1574015974293-817f0ebebb74", "1662532577856-e8ee8b138a8b", "1562151270-c7d22ceb586a", "1604284195847-88dc4b5a9faa", "1761637322362-113b4f6c633c"] },
  clothing: { words: "clothes on rails, boutiques and shopping bags", ids: ["1558769132-cb1aea458c5e", "1483985988355-763728e1935b", "1441986300917-64674bd600d8", "1603400521630-9f2de124b33b", "1490481651871-ab68de25d43d", "1441984904996-e0b6ba687e04"] },
  jewellery: { words: "rings, earrings and necklaces", ids: ["1617038220319-276d3cfab638", "1535632066927-ab7c9ab60908", "1543294001-f7cd5d7fb516", "1631982690223-8aa4be0a2497", "1569397288884-4d43d6738fbd", "1585960622850-ed33c41d6418"] },
  homes: { words: "modern houses, villas and facades", ids: ["1628012209120-d9db7abf7eab", "1564703048291-bcf7f001d83d", "1549357957-99ab8644c268", "1660361338517-8c8fbb3ac264", "1756706718604-ef4af3970e33", "1721815693498-cc28507c0ba2"] },
  events: { words: "conference stages, speakers and audiences", ids: ["1540575467063-178a50c2df87", "1505373877841-8d25f7d46678", "1773829020694-413e879d2957", "1559223694-98ed5e272fef", "1582192730841-2a682d7375f9", "1602137925482-00fb0ed07877"] },
  weddings: { words: "couples, table settings and receptions", ids: ["1583939003579-730e3918a45a", "1519225421980-715cb0215aed", "1511795409834-ef04bbd61622", "1561593367-66c79c2294e6", "1648154164366-d067faecdc51"] },
  devices: { words: "headphones and gadgets on plain surfaces", ids: ["1505740420928-5e560c06d30e", "1618366712010-f4ae9c647dcb", "1583394838336-acd977736f90", "1505740106531-4243f3831c78", "1599669454699-248893623440", "1487215078519-e21cc028cb29"] },
  studio: { words: "creative studios, desks and makers at work", ids: ["1785637394287-13d5fdf5c96f", "1742440710226-450e3b85c100", "1790567046350-882c63c615e9", "1768471125958-78556538fadc", "1780241623929-a695fdac13cc", "1782290547018-8bb89b8edf07"] },
  "still-life": { words: "minimal objects, bottles and shapes", ids: ["1604782206219-3b9576575203", "1793707758252-09808b33d1e9", "1727257049009-940bed27080f", "1591360236480-4ed861025fa1", "1572635148818-ef6fd45eb394", "1752520836249-2b8738e12664"] },
  salon: { words: "hair salons, barbers and stylists", ids: ["1634449571010-02389ed0f9b0", "1580618672591-eb180b1a973f", "1605497788044-5a32c7078486", "1600948836101-f9ffda59d250", "1503951914875-452162b0f3f1", "1773904215697-e6c21fc27ac2"] },
  fitness: { words: "gyms, weights and training", ids: ["1534438327276-14e5300c3a48", "1571902943202-507ec2618e8f", "1757924284732-4189190321cf", "1526506118085-60ce8714f8c5", "1623874514711-0f321325f318", "1548690312-e3b507d8c110"] },
  teams: { words: "people working together at tables and laptops", ids: ["1603201667141-5a2d4c673378", "1630487656049-6db93a53a7e9", "1603195827187-459ab02554a0", "1758518730083-4c12527b6742", "1572021335469-31706a17aaef", "1758873268695-1b55590e507a"] },
  workspace: { words: "laptops, desks and notebooks", ids: [0, 1, 2, 3, 5, 20, 60, 201] },
  people: { words: "portraits and people outdoors", ids: [22, 64, 65, 91, 129, 389, 390] },
  city: { words: "skylines, streets and traffic", ids: [43, 61, 84, 214, 259, 274, 382, 391, 522] },
  "architecture-and-interiors": { words: "doors, facades, old towns and halls", ids: [78, 142, 164, 188, 193, 195, 208, 288, 514] },
  nature: { words: "mountains, forests, waterfalls and fields", ids: [11, 15, 62, 66, 287, 381, 509, 510, 518] },
  "sea-and-coast": { words: "beaches, piers, boats and calm water", ids: [10, 13, 74, 124, 199, 218, 385, 521] },
  "travel-and-roads": { words: "railways, roads and open country", ids: [69, 85, 204, 254, 278, 387, 519] },
  "objects-and-detail": { words: "shoes, books, blossom, tools and objects", ids: [21, 24, 25, 35, 45, 252, 284] },
  "music-and-night": { words: "concert light, city nights and neon", ids: [96, 158, 195, 274, 84] },
  "calm-and-texture": { words: "water drops, sky, fog and wood", ids: [41, 53, 123, 143, 194, 279] },
} as const satisfies Record<string, { words: string; ids: readonly PhotoId[] }>;

export type PhotoSubject = keyof typeof PHOTO_SUBJECTS;

/** A photo at the size a layout needs (both services crop it to fill). */
export function photoUrl(id: PhotoId, width: number, height: number): string {
  const w = Math.round(width);
  const h = Math.round(height);
  return typeof id === "string" ? `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80` : `https://picsum.photos/id/${id}/${w}/${h}`;
}

/**
 * The subject and shape of a photo address, when it's one of these photos: what Studio's Replace opens on,
 * so a clothing photo is replaced from clothing and a tall slot stays tall.
 */
export function photoFacts(url: string | null): { subject: PhotoSubject | null; tall: boolean } | null {
  if (!url) return null;
  const unsplash = /^https:\/\/images\.unsplash\.com\/photo-(\d{10,13}-[0-9a-f]{12})\?[^#]*?\bw=(\d+)&h=(\d+)/.exec(url);
  const picsum = /^https:\/\/picsum\.photos\/id\/(\d{1,4})\/(\d{2,4})\/(\d{2,4})/.exec(url);
  const m = unsplash ?? picsum;
  if (!m) return null;
  const id: PhotoId = unsplash ? m[1]! : Number(m[1]);
  const subject = (Object.keys(PHOTO_SUBJECTS) as PhotoSubject[]).find((s) => (PHOTO_SUBJECTS[s].ids as readonly PhotoId[]).includes(id)) ?? null;
  return { subject, tall: Number(m[3]) > Number(m[2]) };
}

/** Whether an address is one of these photos. */
export function isPhotoUrl(url: string): boolean {
  return (
    /^https:\/\/picsum\.photos\/id\/\d{1,4}\/\d{2,4}\/\d{2,4}(?:\.(?:jpg|webp))?$/.test(url) ||
    /^https:\/\/images\.unsplash\.com\/photo-\d{10,13}-[0-9a-f]{12}\?auto=format&fit=crop&w=\d{2,4}&h=\d{2,4}&q=\d{2}$/.test(url)
  );
}

/** The photos as the agent reads them: how to address each source, then every subject's ids. */
export function photosForPrompt(): string {
  return [
    "   A number is a Picsum photo: https://picsum.photos/id/<id>/<width>/<height>. A string is an Unsplash photo: https://images.unsplash.com/photo-<id>?auto=format&fit=crop&w=<width>&h=<height>&q=80.",
    ...(Object.entries(PHOTO_SUBJECTS) as [PhotoSubject, (typeof PHOTO_SUBJECTS)[PhotoSubject]][]).map(([subject, s]) => `- ${subject} (${s.words}): ${s.ids.join(", ")}`),
  ].join("\n");
}
