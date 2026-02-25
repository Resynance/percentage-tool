select count (*) from prompt_authenticity_records
where created_at > '02-20-2025'
and version_no equals 1


select distinct analysis_status
from prompt_authenticity_records