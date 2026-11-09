package com.isandt.backend.common.web;

import java.util.List;

/**
 * Something saved, plus things worth knowing that didn't stop it ("over the weekly hour limit",
 * "not enough stock"). Rules that warn instead of block return this, and the admin portal shows
 * the warnings next to the result.
 */
public record Saved<T>(T result, List<String> warnings) {
}
