# Source manifest

One JSON file per source, named by its id: where the scan comes from, and the rights read on the holder's own page
before downloading (`rights.statement`, `where`, `checked`, `verdict`: clean = public-domain work and an open copy, no
non-commercial or share-alike terms). `files` lists every file `trace.py fetch <id>` downloads into
`tools/trace/raw/<id>/` (gitignored). Add a new source as a new file; never edit another source's file to add yours.
