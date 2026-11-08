package com.isandt.backend.activity;

import java.util.List;

/** One page of the activity log, newest first; more = there's an older page. */
public record ActivityPage(List<ActivityResponse> items, boolean more, long total) {
}
