/** Which reader a file needs (stage 194), and the files Farbaek can't read, with what to export instead. */
import { describe, expect, it } from "vitest";
import { detectFormat, unreadableFile } from "./detect";
import { readPoints } from "./read";

describe("choosing a file's reader", () => {
  it("knows each format by its content first, then by its name", () => {
    expect(detectFormat("pts.csv", "1,700004.21,450012.345,21.43,CP")).toBe("delimited");
    expect(detectFormat("job.txt", "*110001+0000000000000001 81..00+0000000450012345 82..00+0000000700004210")).toBe("gsi");
    expect(detectFormat("job.txt", "00NMSDR33 V04-04.02                         211111\n08KI")).toBe("sdr");
    expect(detectFormat("export.xml", '<?xml version="1.0"?>\n<LandXML version="1.2"><CgPoints/></LandXML>')).toBe("landxml");
    expect(detectFormat("job.xml", '<?xml version="1.0"?>\n<JOBFile version="5.2"></JOBFile>')).toBe("jobxml");
    expect(detectFormat("pts.geojson", "{}")).toBe("geojson");
    expect(detectFormat("pts.json", '{"type":"FeatureCollection","features":[]}')).toBe("geojson");
  });

  it("names the files it can't read, with what to export instead", () => {
    expect(unreadableFile("job.dbx", "x")).toMatch(/^This is an instrument's own job database/);
    expect(unreadableFile("pts.csv", "a\u0000b")).toMatch(/^This is an instrument's own job database/);
    expect(unreadableFile("job.dc", "10NMJOB")).toMatch(/^This is a Trimble DC file/);
    expect(unreadableFile("job.dc", "00NMSDR33 V04-04.02                         211111")).toBeNull();
    expect(unreadableFile("job.gt7", "JOB     ,NM:demo\nSTN     ,PN:9001,IH:1.5\nXYZ     ,1000.000,2000.000,10.000")).toMatch(/^This looks like a Topcon GTS-7 job file/);
    expect(unreadableFile("pts.csv", "1,700004.21,450012.345,21.43,CP")).toBeNull();
  });

  it("reads every format through one entry point, with the date a JobXML file states", () => {
    const o = { delimiter: "," as const, hasHeader: false, columns: ["point", "northing", "easting", "elevation", "code"] as const, crs: null };
    expect(readPoints("delimited", "1,700004.21,450012.345,21.43,CP", o).points[0]).toMatchObject({ pointId: "1", n: 700004.21, e: 450012.345 });
    const job = '<JOBFile><FieldBook><PointRecord ID="1" TimeStamp="2026-11-14T10:00:00"><Deleted>false</Deleted></PointRecord></FieldBook><Reductions><Point><ID>1</ID><Name>1</Name><Code>CP</Code><Grid><North>700004.21</North><East>450012.345</East><Elevation>21.43</Elevation></Grid></Point></Reductions></JOBFile>';
    const r = readPoints("jobxml", job, o);
    expect(r.surveyDate).toBe("2026-11-14");
    expect(r.points[0]).toMatchObject({ pointId: "1", code: "CP" });
  });
});
