/** Which reader a file needs (stage 194), and the files Farbaek can't read, with what to export instead. */
import { describe, expect, it } from "vitest";
import { detectFormat, printoutSource, unreadableFile } from "./detect";
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

/**
 * Printouts (stage 198). SYNTHETIC: the heading lines follow a real Sokkia Link printout a surveyor uploaded (seen in screenshots,
 * 2026-11-16), with a made-up job name and path. Its table rows aren't reproduced: recognising it never depends on them.
 */
const SOKKIA = [
  "                JOB         NM   Job ID: SAMPLEWATTA",
  "SAMPLEWATTA/samplewatta.sdr",
  "------------------------------------------------------------",
  "                SCALE       NM   S.F.: 1.00000000",
  "                INSTR       NM   Theo Desc: SET650X V30-22      Vert Ang Ref: Zenith",
  "Project       :     SAMPLEWATTA",
  "File Name     :     E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir\\samplewatta.sdr",
  "Print Date    :     2026-08-04    3:12:30",
  "Distance Unit :     Meters",
  "Angle Unit    :     Degrees [dd.mmss]",
  "Pt.        Record Type   DC   North/Hor      East/Vert      Elev/Slope     Code",
].join("\r\n");

describe("printouts", () => {
  it("knows Sokkia Link's printout, and names the job file to upload instead, with its path", () => {
    expect(printoutSource(SOKKIA)).toMatchObject({
      kind: "sokkia",
      job: "SAMPLEWATTA",
      file: "samplewatta.sdr",
      folder: "E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir",
      path: "E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir\\samplewatta.sdr",
    });
    expect(unreadableFile("SAMPLEWATTA.txt", SOKKIA)).toBe(
      "This is Sokkia Link's printout of the job SAMPLEWATTA, made for printing, so its lines aren't one point each. Upload the job file itself instead: samplewatta.sdr, in E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir. Or export the job's coordinates from Sokkia Link as a CSV (point, northing, easting, height, code).",
    );
    // Pasted, with no file name, it's the same.
    expect(unreadableFile("", SOKKIA)).toMatch(/^This is Sokkia Link's printout of the job SAMPLEWATTA/);
  });

  it("takes the folder from the File Name line and the job file from wherever the printout names it", () => {
    const own = SOKKIA.replace("SAMPLEWATTA.dir\\samplewatta.sdr", "SAMPLEWATTA.dir\\samplewatta.prn");
    expect(printoutSource(own)).toMatchObject({ file: "samplewatta.sdr", folder: "E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir", path: "E:\\SOKKIA Link\\Projects\\SAMPLEWATTA.dir\\samplewatta.sdr" });
    // Two marks and nothing named: the advice in general words.
    const bare = ["Theo Desc: SET650X", "Print Date : 2026-08-04", "Distance Unit : Meters", "1 500000.000 409000.000 10.000 CP"].join("\n");
    expect(printoutSource(bare)).toMatchObject({ kind: "sokkia", job: null, file: null, path: null });
    expect(unreadableFile("job.txt", bare)).toBe(
      "This is Sokkia Link's printout, made for printing, so its lines aren't one point each. Upload the job file itself instead: the job's .sdr file, in Sokkia Link's project folder. Or export the job's coordinates from Sokkia Link as a CSV (point, northing, easting, height, code).",
    );
  });

  it("knows any other report that starts with headings, and says which", () => {
    const report = ["Project : Sample land", "Surveyor : A. Sample", "Date : 2026-11-16", "1,500000.000,409000.000,10.000,CP"].join("\n");
    expect(unreadableFile("report.txt", report)).toBe(
      "This file starts with headings (Project, Surveyor, Date), not points, so it looks like a printed report. Upload the instrument's job file or a points file instead. If the points follow the headings, delete the heading lines and upload it again.",
    );
  });

  it("never mistakes a file Farbaek reads for a printout", () => {
    const files: [string, string][] = [
      ["pts.csv", "1,700004.21,450012.345,21.43,CP\n2,700007.884,450043.912,21.88,CP"],
      ["pts.csv", "Point,Northing,Easting,Elevation,Code\n1,700004.21,450012.345,21.43,CP"],
      ["pts.txt", "1 700004.21 450012.345 21.43 BM:1\n2 700007.884 450043.912 21.88 CP 10:30"],
      ["job.gsi", "*110001+0000000000000001 81..00+0000000450012345 82..00+0000000700004210"],
      ["job.sdr", "00NMSDR33 V04-04.02                         211111\n01NM:SET650X V30-22\n08KI       1   700004.210   450012.345    21.430CP"],
      ["job.xml", '<?xml version="1.0"?>\n<LandXML version="1.2"><CgPoints/></LandXML>'],
      ["job.jxl", '<?xml version="1.0"?>\n<JOBFile version="5.2"></JOBFile>'],
      ["pts.geojson", '{"type":"FeatureCollection","features":[]}'],
      ["legs.txt", "# Farbaek field book: bearings and distances, unadjusted\nstart,1,450000,700000\nleg,1,2,45 00 00,25.4"],
      // One Sokkia mark alone isn't enough.
      ["pts.csv", "# exported from SOKKIA Link\n1,700004.21,450012.345,21.43,CP"],
    ];
    for (const [name, text] of files) {
      expect(printoutSource(text)?.kind === "sokkia" || /printed report|printout/.test(unreadableFile(name, text) ?? "")).toBe(false);
    }
  });
});
