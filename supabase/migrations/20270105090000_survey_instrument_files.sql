-- Farbaek schema v95: Survey Studio reads instrument files (stage 194, ADR 0209).
--
-- Points can now come straight from the files instruments and controllers
-- write, not only CSV and GeoJSON: Leica GSI, Sokkia SDR, LandXML and
-- Trimble JobXML. Each is read by its own tested reader in the app (the
-- server reads the stored file again before anything is saved), and the
-- stored source keeps its true format, so the record says what was read.
-- Nothing else changes: the file is still stored exactly as uploaded, with
-- its SHA-256, and points are still never edited.

alter table public.survey_sources drop constraint survey_sources_format_check;
alter table public.survey_sources add constraint survey_sources_format_check
  check (format in ('delimited', 'geojson', 'gsi', 'sdr', 'landxml', 'jobxml'));
