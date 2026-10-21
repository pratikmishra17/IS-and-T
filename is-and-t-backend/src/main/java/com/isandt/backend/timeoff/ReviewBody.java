package com.isandt.backend.timeoff;

import jakarta.validation.constraints.Size;

/** An admin's optional note when approving or declining. */
public record ReviewBody(@Size(max = 500) String note) {
}
