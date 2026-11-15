/** LandXML and Trimble JobXML (stage 194): SYNTHETIC files in the documented layouts. */
import { describe, expect, it } from "vitest";
import { looksLikeJobXml, parseJobXml } from "./jobxml";
import { looksLikeLandXml, parseLandXml } from "./landxml";
import { decodeXml } from "./xml";

const landxml = (units: string, points: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported for a test -->
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="2026-11-15">
  <Units>${units}</Units>
  <CgPoints name="Field">
${points}
  </CgPoints>
</LandXML>`;
const metric = `<Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimal degrees" directionUnit="decimal degrees"/>`;

describe("LandXML points", () => {
  it("reads CgPoints as northing, easting and elevation, with code or description", () => {
    const r = parseLandXml(landxml(metric, `<CgPoint name="1" code="CP">700004.210 450012.345 21.43</CgPoint>\n<CgPoint name="2" desc="MW &amp; CP">700007.884 450043.912</CgPoint>`));
    expect(r.issues).toEqual([]);
    expect(r.points.map((p) => [p.pointId, p.n, p.e, p.z, p.code])).toEqual([
      ["1", 700004.21, 450012.345, 21.43, "CP"],
      ["2", 700007.884, 450043.912, null, "MW & CP"],
    ]);
  });

  it("scales millimetres exactly, and refuses imperial units", () => {
    const mm = parseLandXml(landxml(metric.replace('linearUnit="meter"', 'linearUnit="millimeter"'), `<CgPoint name="1">700004210 450012345.5</CgPoint>`));
    expect(mm.points[0]).toMatchObject({ n: 700004.21, e: 450012.3455 });
    expect(parseLandXml(landxml(`<Imperial linearUnit="USSurveyFoot"/>`, `<CgPoint name="1">1 2</CgPoint>`)).issues[0]!.message).toMatch(/^The LandXML file is in imperial units\./);
  });

  it("leaves out points that only refer to another, and refuses observations without points", () => {
    const r = parseLandXml(landxml(metric, `<CgPoint name="1" code="CP">700004.210 450012.345</CgPoint>\n<CgPoint name="1a" pntRef="1"/>`));
    expect(r.points.map((p) => p.pointId)).toEqual(["1"]);
    expect(r.issues[0]!.message).toBe("1 CgPoint only refers to another point (pntRef) and was left out: it's the same point under another name.");
    const obs = parseLandXml(landxml(metric, "").replace("</CgPoints>", "</CgPoints><Survey><InstrumentSetup id='s1'><RawObservation horizAngle='1'/></InstrumentSetup></Survey>"));
    expect(obs.issues[0]!.message).toMatch(/holds instrument observations/);
  });

  it("refuses a point without numbers or with too many, each with its line", () => {
    const r = parseLandXml(landxml(metric, `<CgPoint name="9">700004.210 abc</CgPoint>\n<CgPoint name="8">1 2 3 4</CgPoint>`));
    expect(r.points).toEqual([]);
    expect(r.issues.map((i) => i.line)).toEqual([6, 7]);
    expect(looksLikeLandXml(landxml(metric, ""))).toBe(true);
    expect(decodeXml("a &lt;b&gt; &#65;&#x42;")).toBe("a <b> AB");
  });
});

const jobxml = (records: string, reductions: string) => `<?xml version="1.0" encoding="UTF-8"?>
<JOBFile version="5.2" product="Trimble Access" TimeStamp="2026-11-14T16:00:00">
  <FieldBook>
${records}
  </FieldBook>
  <Reductions>
${reductions}
  </Reductions>
  <Environment/>
</JOBFile>`;
const record = (id: string, ts: string, deleted = false) => `<PointRecord ID="${id}" TimeStamp="${ts}"><Name>x</Name><Code/><Method>Topo</Method><Deleted>${deleted}</Deleted><ComputedGrid><North>1</North><East>2</East><Elevation>3</Elevation></ComputedGrid></PointRecord>`;
const point = (id: string, name: string, code: string, grid: string) => `<Point><ID>${id}</ID><Name>${name}</Name><Code>${code}</Code>${grid}</Point>`;

describe("Trimble JobXML points", () => {
  it("reads the final grid coordinates from Reductions, leaves out deleted points, and offers the last day observed", () => {
    const text = jobxml(
      [record("00000001", "2026-11-13T09:00:00"), record("00000002", "2026-11-14T10:30:00"), record("00000003", "2026-11-15T11:00:00", true)].join("\n"),
      [
        point("00000001", "1", "CP", "<Grid><North>700004.210</North><East>450012.345</East><Elevation>21.430</Elevation></Grid>"),
        point("00000002", "2", "MW", "<Grid><North>700007.884</North><East>450043.912</East><Elevation/></Grid>"),
        point("00000003", "3", "CP", "<Grid><North>700010</North><East>450050</East><Elevation>21</Elevation></Grid>"),
        point("00000004", "BASE", "", "<WGS84><Latitude>6.9</Latitude><Longitude>79.8</Longitude></WGS84>"),
      ].join("\n"),
    );
    const r = parseJobXml(text);
    expect(r.points.map((p) => [p.pointId, p.n, p.e, p.z, p.code])).toEqual([
      ["1", 700004.21, 450012.345, 21.43, "CP"],
      ["2", 700007.884, 450043.912, null, "MW"],
    ]);
    expect(r.surveyDate).toBe("2026-11-14");
    expect(r.issues.map((i) => i.message)).toEqual(["1 point has no grid coordinates (only WGS84 or local values) and isn't imported."]);
    expect(looksLikeJobXml(text)).toBe(true);
  });

  it("says why when no point has grid coordinates, or there are no reductions", () => {
    const wgs = parseJobXml(jobxml("", point("1", "BASE", "", "<WGS84><Latitude>6.9</Latitude></WGS84>")));
    expect(wgs.issues[0]!.message).toMatch(/^The JobXML points have no grid coordinates/);
    expect(parseJobXml(`<JOBFile><FieldBook/></JOBFile>`).issues[0]!.message).toMatch(/^The JobXML file has no Reductions section/);
  });
});
