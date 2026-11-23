-- Farbaek schema v104: two more survey file formats (stage 242, ADR 0250). One change, nothing taken away.
--
-- Sokkia Link's printed point list ('sokkialist') and the points of a DXF drawing ('dxf') are now read, each by its own tested reader
-- in the app; the server reads the stored file again before anything is saved, and the stored source keeps its true format, so the
-- record says what was read. Until this is applied, a plan from one of these two files is refused with a plain sentence; every other
-- format works as before.

alter table public.survey_sources drop constraint survey_sources_format_check;
alter table public.survey_sources add constraint survey_sources_format_check
  check (format in ('delimited', 'geojson', 'gsi', 'sdr', 'landxml', 'jobxml', 'fieldbook', 'sokkialist', 'dxf'));
