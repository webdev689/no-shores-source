# toolkit-data save refused a log that held the branch's content

- **What happened:** at the session's end, `toolkit-data.sh save` refused: "this log was not restored from the branch".
  The session had started before the kit's restore step existed; its start scan made `skill-observations/` first, so
  a later `restore` took the branch's files in (skip-old-files) but, the folder not being fresh, wrote no
  `restored-from`. Save then refused though the log now held the branch's tip plus one observation of this session's.
- **Done here:** wrote `restored-from` as FETCH_HEAD after the restore (what restore writes for a fresh log), then saved.
- **Proposed:** `restore` could write `restored-from` whenever it is missing, since it has just laid the branch's files
  in, rather than only when the folder is new. The owner's to agree.
