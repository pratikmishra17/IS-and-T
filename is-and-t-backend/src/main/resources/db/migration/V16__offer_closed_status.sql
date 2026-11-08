-- An offer whose task finished, was cancelled, or went to that student some other way: nobody
-- needs to answer it any more, so it's CLOSED ("no longer needed") rather than left waiting.
ALTER TABLE task_offers DROP CONSTRAINT task_offers_status_check;
ALTER TABLE task_offers ADD CONSTRAINT task_offers_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CLOSED'));
